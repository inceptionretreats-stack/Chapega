import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../../core/storage/secure_store.dart';
import '../../models/studio_snapshot.dart';
import '../../models/vendor_product.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../../ui/product_image.dart';
import '../studio/request_guard.dart';
import '../studio/studio_store.dart';
import 'image_pipeline.dart';
import 'product_draft.dart';

/// Matches photos this app (or the web Studio) uploaded, which can be
/// cleaned up when replaced; catalogue art under /products is never deleted.
final _vendorUpload = RegExp(r'^/vendor-products/(?:[a-f0-9-]{36}/)?[a-f0-9]{64}\.(?:png|jpg)$');

/// Add or edit a product (full screen, above the tabs).
class ProductEditorScreen extends ConsumerStatefulWidget {
  const ProductEditorScreen({super.key, required this.slug, this.productId});

  final String slug;

  /// Null when adding a product.
  final String? productId;

  @override
  ConsumerState<ProductEditorScreen> createState() => _ProductEditorScreenState();
}

class _ProductEditorScreenState extends ConsumerState<ProductEditorScreen> {
  final _scroll = ScrollController();

  /// After a failed save the summary is at the top; bring it into view.
  void _showErrors() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  ProductDraft? _draft;
  String _savedSignature = '';
  VendorProduct? _product;
  int? _version;
  String? _image;
  Uint8List? _photo;
  bool _preparingPhoto = false;
  bool _pending = false;
  bool _archiving = false;
  String? _error;
  Map<String, String> _fieldErrors = {};
  Map<String, OptionErrors> _optionErrors = {};
  final Map<String, TextEditingController> _controllers = {};

  bool get _isNew => widget.productId == null;
  bool get _dirty => _photo != null || (_draft?.signature ?? '') != _savedSignature;

  @override
  void initState() {
    super.initState();
    unawaited(_recoverLostPhoto());
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  void _load(StudioSnapshot data, {VendorProduct? product}) {
    final source = product ?? (_isNew ? null : data.product(widget.productId!));
    if (!_isNew && source == null) return;
    _product = source;
    _version = source?.version;
    _image = source?.image;
    _draft = ProductDraft.forProduct(source);
    _savedSignature = _draft!.signature;
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    _controllers.clear();
  }

  TextEditingController _controller(String key, String initial) =>
      _controllers.putIfAbsent(key, () => TextEditingController(text: initial));

  /// Android may close the app while the camera is open; the photo is then
  /// handed back at the next start.
  Future<void> _recoverLostPhoto() async {
    try {
      final lost = await ref.read(photoSourceProvider).recoverLost();
      if (lost != null && mounted) await _usePhoto(lost, recovered: true);
    } on Object {
      // Nothing to recover.
    }
  }

  Future<void> _pickPhoto({required bool camera}) async {
    try {
      final bytes = await ref.read(photoSourceProvider).pick(camera: camera);
      if (bytes != null) await _usePhoto(bytes);
    } on PlatformException catch (error) {
      if (mounted) {
        setState(
          () => _fieldErrors = {
            ..._fieldErrors,
            'image': error.code == 'camera_access_denied'
                ? 'Allow camera access in the phone settings to take product photos.'
                : 'The photo could not be opened. Try another one.',
          },
        );
      }
    }
  }

  Future<void> _usePhoto(Uint8List bytes, {bool recovered = false}) async {
    setState(() => _preparingPhoto = true);
    try {
      final jpeg = await prepareProductPhoto(bytes);
      if (!mounted) return;
      setState(() {
        _photo = jpeg;
        _fieldErrors = {..._fieldErrors}..remove('image');
      });
      if (recovered) showToast(context, 'Recovered the photo you just took.');
    } on PhotoProblem catch (problem) {
      if (mounted) setState(() => _fieldErrors = {..._fieldErrors, 'image': problem.message});
    } finally {
      if (mounted) setState(() => _preparingPhoto = false);
    }
  }

  StudioStore get _store => ref.read(studioStoreProvider(widget.slug).notifier);

  Future<void> _save() async {
    final draft = _draft;
    if (draft == null || _pending || _preparingPhoto) return;
    // Validation only needs to know a photo will be there.
    final check = validateDraft(
      draft,
      image: _photo != null ? '/vendor-products/pending.jpg' : _image,
      version: _version,
    );
    if (check.input == null) {
      setState(() {
        _error = check.message;
        _fieldErrors = check.fields;
        _optionErrors = check.options;
      });
      _showErrors();
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
      _fieldErrors = {};
      _optionErrors = {};
    });
    final api = _store.api;
    String? uploaded;
    try {
      var input = check.input!;
      if (_photo != null) {
        uploaded = await api.uploadImage(_photo!, filename: 'product-${uuidV4()}.jpg');
        input = input.withImage(uploaded);
      }
      final saved = _isNew
          ? await api.createProduct(input)
          : await api.updateProduct(widget.productId!, input);
      _store.commitProduct(saved);
      final previous = _product?.image;
      if (previous != null && previous != saved.image && _vendorUpload.hasMatch(previous)) {
        unawaited(api.deleteUpload(previous).catchError((Object _) {}));
      }
      if (!mounted) return;
      _savedSignature = draft.signature;
      _photo = null;
      Navigator.of(context).pop();
      showToast(
        context,
        _isNew ? 'Product added to the kiosk catalogue.' : 'Product changes published.',
      );
    } on ApiFailure catch (failure) {
      if (uploaded != null) unawaited(api.deleteUpload(uploaded).catchError((Object _) {}));
      final handled = await ref.read(requestGuardProvider).handle(widget.slug, failure);
      if (!mounted) return;
      setState(() => _pending = false);
      if (handled.handled) return;
      if (failure is HttpFailure && failure.code == 'VERSION_CONFLICT') {
        await _resolveConflict();
        return;
      }
      setState(() {
        _error = failure.message;
        if (failure is HttpFailure) {
          _fieldErrors = {
            for (final MapEntry(:key, :value) in failure.fields.entries)
              if (value.isNotEmpty) productFieldFromServer(key): value.first,
          };
        }
      });
      _showErrors();
    }
  }

  /// Someone saved this product after it was opened here.
  Future<void> _resolveConflict() async {
    await _store.refresh();
    if (!mounted) return;
    final latest = ref.read(studioStoreProvider(widget.slug)).data?.product(widget.productId!);
    if (latest == null) {
      setState(() => _error = 'This product was archived on another device.');
      return;
    }
    final keepMine = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('This product changed on another device'),
        content: const Text(
          'Someone saved it after you opened it here. Load their version, or keep your changes '
          'and save them over it.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Load latest'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Keep my changes'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    setState(() {
      if (keepMine ?? false) {
        _version = latest.version;
        _product = latest;
        _error = 'Your changes are kept. Save again to replace the other version.';
        _showErrors();
      } else {
        final data = ref.read(studioStoreProvider(widget.slug)).data!;
        _load(data, product: latest);
        _photo = null;
        _error = null;
      }
    });
  }

  Future<void> _archive() async {
    final product = _product;
    if (product == null || _archiving) return;
    final confirmed = await confirmAction(
      context,
      title: 'Archive this product?',
      message:
          '“${product.name}” will be removed from the kiosk and the catalogue. This cannot be '
          'undone here. Previous order records keep their original product snapshot.',
      confirmLabel: 'Archive product',
    );
    if (!confirmed || !mounted) return;
    setState(() => _archiving = true);
    final failure = await _store.guard(
      () => _store.api.archiveProduct(product.id, product.version),
    );
    if (!mounted) return;
    setState(() => _archiving = false);
    if (failure == null) {
      _store.removeProduct(product.id);
      _savedSignature = _draft!.signature;
      _photo = null;
      Navigator.of(context).pop();
      showToast(context, 'Product archived. Past order snapshots remain unchanged.');
    } else if (!failure.handled) {
      setState(() => _error = failure.message);
    }
  }

  Future<bool> _confirmDiscard() => confirmAction(
    context,
    title: 'Discard your changes?',
    message: 'The changes you made to this product are not saved.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
  );

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(studioStoreProvider(widget.slug).select((state) => state.data));
    if (data != null && _draft == null) _load(data);
    final draft = _draft;
    final busy = _pending || _archiving;

    return PopScope(
      canPop: !_dirty && !busy,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || busy) return;
        if (await _confirmDiscard() && context.mounted) {
          _savedSignature = _draft?.signature ?? '';
          _photo = null;
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Close product editor',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          title: Text(_isNew ? 'Add a new product' : 'Edit product'),
        ),
        body: data == null
            ? const Center(child: CircularProgressIndicator())
            : draft == null
            ? const Center(
                child: EmptyState(
                  icon: Icons.search_off,
                  title: 'Product not found',
                  message: 'It may have been archived on another device.',
                ),
              )
            : _form(context, data, draft),
        bottomNavigationBar: draft == null
            ? null
            : SafeArea(
                top: false,
                child: Container(
                  decoration: BoxDecoration(
                    color: context.colors.surface,
                    border: Border(top: BorderSide(color: context.colors.border)),
                  ),
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  child: PendingButton(
                    label: _isNew ? 'Save product' : 'Save changes',
                    pendingLabel: 'Saving…',
                    pending: _pending,
                    icon: Icons.inventory_outlined,
                    onPressed: busy || _preparingPhoto ? null : _save,
                  ),
                ),
              ),
      ),
    );
  }

  Widget _text(
    String key,
    String label, {
    required String value,
    required ValueChanged<String> onChanged,
    int? maxLength,
    String? helper,
    String? hint,
    int maxLines = 1,
    TextInputType? keyboard,
  }) {
    final error = _fieldErrors[key];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: _controller(key, value),
        maxLength: maxLength,
        maxLines: maxLines,
        minLines: 1,
        keyboardType: keyboard ?? (maxLines > 1 ? TextInputType.multiline : TextInputType.text),
        textInputAction: maxLines > 1 ? TextInputAction.newline : TextInputAction.next,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: error == null ? helper : null,
          errorText: error,
          counterText: '',
        ),
        onChanged: (text) {
          onChanged(text);
          setState(() {
            if (_fieldErrors.containsKey(key)) _fieldErrors = {..._fieldErrors}..remove(key);
          });
        },
      ),
    );
  }

  Widget _form(BuildContext context, StudioSnapshot data, ProductDraft draft) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final money = const TextInputType.numberWithOptions(decimal: true);
    return ListView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Text(
          _isNew
              ? 'Share the details below to add a product to your store.'
              : 'Update catalogue details and publish them to the kiosk.',
          style: text.bodyMedium?.copyWith(color: colors.muted),
        ),
        const SizedBox(height: 14),
        if (_error != null) ...[InlineError(_error!), const SizedBox(height: 14)],
        SectionCard(
          title: 'Product image',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 4 / 3,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: _preparingPhoto
                      ? ColoredBox(
                          color: colors.subtle,
                          child: const Center(child: CircularProgressIndicator()),
                        )
                      : _photo != null
                      ? Image.memory(_photo!, fit: BoxFit.cover, semanticLabel: 'New product photo')
                      : _image != null
                      ? LayoutBuilder(
                          builder: (context, box) =>
                              ProductImage(slug: widget.slug, path: _image!, size: box.maxWidth),
                        )
                      : ColoredBox(
                          color: colors.subtle,
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.add_photo_alternate_outlined,
                                  size: 40,
                                  color: colors.muted,
                                ),
                                const SizedBox(height: 6),
                                Text('Choose a product image', style: text.titleSmall),
                              ],
                            ),
                          ),
                        ),
                ),
              ),
              if (_fieldErrors['image'] != null) ...[
                const SizedBox(height: 6),
                Text(
                  _fieldErrors['image']!,
                  style: text.bodySmall?.copyWith(
                    color: colors.dangerText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pending ? null : () => _pickPhoto(camera: true),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text('Take photo'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pending ? null : () => _pickPhoto(camera: false),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Library'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Photos are turned upright and sent as JPEG, up to 2048 px.',
                style: text.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Product details',
          child: Column(
            children: [
              _text(
                'name',
                'Name',
                value: draft.name,
                maxLength: 120,
                onChanged: (v) => draft.name = v,
              ),
              _text(
                'shortDescription',
                'Short description',
                value: draft.shortDescription,
                maxLength: 180,
                helper: 'Shown on the kiosk product card.',
                onChanged: (v) => draft.shortDescription = v,
              ),
              _text(
                'description',
                'Full description',
                value: draft.description,
                maxLength: 2000,
                maxLines: 5,
                onChanged: (v) => draft.description = v,
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Autocomplete<String>(
                  initialValue: TextEditingValue(text: draft.category),
                  optionsBuilder: (value) => data.categories.where(
                    (category) => category.toLowerCase().contains(value.text.toLowerCase()),
                  ),
                  onSelected: (value) => setState(() => draft.category = value),
                  fieldViewBuilder: (context, controller, focus, onSubmitted) => TextField(
                    controller: controller,
                    focusNode: focus,
                    maxLength: 80,
                    decoration: InputDecoration(
                      labelText: 'Category',
                      errorText: _fieldErrors['category'],
                      counterText: '',
                    ),
                    onChanged: (value) => setState(() => draft.category = value),
                  ),
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _text(
                      'price',
                      'Price (₹)',
                      value: draft.price,
                      keyboard: money,
                      onChanged: (v) => draft.price = v,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _text(
                      'compareAtPrice',
                      'Compare-at price (₹)',
                      value: draft.compareAtPrice,
                      hint: 'Optional',
                      keyboard: money,
                      onChanged: (v) => draft.compareAtPrice = v,
                    ),
                  ),
                ],
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _text(
                      'stock',
                      'Stock quantity',
                      value: draft.stock,
                      keyboard: TextInputType.number,
                      onChanged: (v) => draft.stock = v,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _text(
                      'preparationTime',
                      'Preparation note',
                      value: draft.preparationTime,
                      maxLength: 120,
                      onChanged: (v) => draft.preparationTime = v,
                    ),
                  ),
                ],
              ),
              _text(
                'tags',
                'Search tags',
                value: draft.tags,
                hint: 'personalised, wooden, anniversary',
                helper: 'Separate tags with commas.',
                onChanged: (v) => draft.tags = v,
              ),
              _text(
                'occasionTags',
                'Occasions',
                value: draft.occasionTags,
                hint: 'Birthday, Wedding',
                onChanged: (v) => draft.occasionTags = v,
              ),
              _text(
                'recipientTags',
                'Recipients',
                value: draft.recipientTags,
                hint: 'For Her, For Couple',
                onChanged: (v) => draft.recipientTags = v,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _OptionsCard(
          draft: draft,
          errors: _optionErrors,
          onChanged: () => setState(() {
            _optionErrors = {};
          }),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Kiosk presentation',
          padding: const EdgeInsets.only(bottom: 8),
          child: Column(
            children: [
              SwitchListTile(
                value: draft.visible,
                onChanged: (value) => setState(() => draft.visible = value),
                title: const Text('Show on kiosk'),
                subtitle: const Text('Visible products appear in the customer catalogue.'),
              ),
              SwitchListTile(
                value: draft.giftWrapEligible,
                onChanged: (value) => setState(() => draft.giftWrapEligible = value),
                title: const Text('Gift wrapping'),
                subtitle: const Text('Allow customers to add the configured wrap service.'),
              ),
              SwitchListTile(
                value: draft.featured,
                onChanged: (value) => setState(() => draft.featured = value),
                title: const Text('Featured gift'),
                subtitle: const Text('Give this product priority in catalogue discovery.'),
              ),
            ],
          ),
        ),
        if (!_isNew) ...[
          const SizedBox(height: 12),
          SectionCard(
            title: 'Archive this product',
            subtitle:
                'It disappears from the kiosk, while previous order records keep their original '
                'product snapshot.',
            child: Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: _pending || _archiving ? null : _archive,
                icon: _archiving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.archive_outlined),
                label: Text(_archiving ? 'Archiving…' : 'Archive'),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// "Offer a choice": sizes, finishes, colours, each with its own price and
/// optional stock.
class _OptionsCard extends StatelessWidget {
  const _OptionsCard({required this.draft, required this.errors, required this.onChanged});

  final ProductDraft draft;
  final Map<String, OptionErrors> errors;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SectionCard(
      title: 'Product options',
      subtitle: 'Add sizes, finishes, colours, or any other choice customers should select.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (draft.options.isEmpty)
            Text(
              'No options added. Customers will order this product using its main price and stock.',
              style: text.bodySmall,
            ),
          for (final (index, option) in draft.options.indexed)
            _OptionRow(
              key: ValueKey(option.id),
              index: index,
              option: option,
              errors: errors[option.id],
              customerPrice: draft.optionCustomerPrice(option),
              onChanged: onChanged,
              onRemove: () {
                draft.options = [...draft.options]..removeAt(index);
                onChanged();
              },
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${draft.options.length} of $maxOptions options',
                  style: text.bodySmall,
                ),
              ),
              OutlinedButton.icon(
                onPressed: draft.options.length >= maxOptions
                    ? null
                    : () {
                        draft.options = [...draft.options, OptionDraft.blank()];
                        onChanged();
                      },
                icon: const Icon(Icons.add),
                label: const Text('Add option'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OptionRow extends StatefulWidget {
  const _OptionRow({
    super.key,
    required this.index,
    required this.option,
    required this.errors,
    required this.customerPrice,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final OptionDraft option;
  final OptionErrors? errors;
  final String? customerPrice;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  State<_OptionRow> createState() => _OptionRowState();
}

class _OptionRowState extends State<_OptionRow> {
  late final _name = TextEditingController(text: widget.option.name);
  late final _adjustment = TextEditingController(text: widget.option.adjustment);
  late final _stock = TextEditingController(text: widget.option.stock);

  @override
  void dispose() {
    _name.dispose();
    _adjustment.dispose();
    _stock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final errors = widget.errors;
    final label = widget.option.name.trim().isEmpty
        ? 'option ${widget.index + 1}'
        : widget.option.name.trim();
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 12),
      decoration: BoxDecoration(
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('Option ${widget.index + 1}', style: text.titleSmall)),
              IconButton(
                tooltip: 'Remove $label',
                onPressed: widget.onRemove,
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
          if (errors?.row != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(errors!.row!, style: text.bodySmall?.copyWith(color: colors.dangerText)),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 8, bottom: 10),
            child: TextField(
              controller: _name,
              maxLength: 120,
              decoration: InputDecoration(
                labelText: 'Option name',
                hintText: 'e.g. Walnut finish',
                errorText: errors?.name,
                counterText: '',
              ),
              onChanged: (value) {
                widget.option.name = value;
                widget.onChanged();
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: _adjustment,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Price adjustment (₹)',
                      helperText: errors?.adjustment == null ? 'Minus for a cheaper option.' : null,
                      errorText: errors?.adjustment,
                    ),
                    onChanged: (value) {
                      widget.option.adjustment = value;
                      widget.onChanged();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _stock,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Option stock',
                      hintText: 'Use product stock',
                      helperText: errors?.stock == null ? 'Blank shares the main stock.' : null,
                      errorText: errors?.stock,
                    ),
                    onChanged: (value) {
                      widget.option.stock = value;
                      widget.onChanged();
                    },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text('Customer price: ${widget.customerPrice ?? 'Check price'}', style: text.labelMedium),
        ],
      ),
    );
  }
}
