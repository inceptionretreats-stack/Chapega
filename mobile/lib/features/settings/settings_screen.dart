import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_failure.dart';
import '../../domain/dates.dart';
import '../../domain/money.dart';
import '../../domain/whatsapp.dart';
import '../../models/studio_snapshot.dart';
import '../../models/vendor_settings.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_store.dart';

/// The settings form as typed; numbers stay text until publishing.
class _SettingsDraft {
  _SettingsDraft(VendorSettings settings)
    : shopName = settings.shopName,
      kioskName = settings.kioskName,
      storeOpen = settings.storeOpen,
      countryCode = settings.defaultCountryCode,
      whatsapp = settings.ownerWhatsAppNumber,
      maxUnits = '${settings.maxCartQuantity}',
      giftWrapFee = paiseToRupeeInput(settings.giftWrapFeePaise),
      qrReset = '${settings.qrResetSeconds}',
      lowStock = '${settings.lowStockThreshold}',
      previewLabel = settings.showPreviewLabel;

  String shopName;
  String kioskName;
  bool storeOpen;
  String countryCode;
  String whatsapp;
  String maxUnits;
  String giftWrapFee;
  String qrReset;
  String lowStock;
  bool previewLabel;

  String get signature => [
    shopName,
    kioskName,
    storeOpen,
    countryCode,
    whatsapp,
    maxUnits,
    giftWrapFee,
    qrReset,
    lowStock,
    previewLabel,
  ].join('\u0000');
}

/// Shop settings (owners): what the kiosk shows, where orders go, and the
/// ordering rules. Publishing replaces the shop's settings as a whole and
/// is refused when someone else published in the meantime.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _scroll = ScrollController();

  /// After a failed publish the summary is at the top; bring it into view.
  void _showErrors() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  VendorSettings? _baseline;
  _SettingsDraft? _draft;
  String _baselineSignature = '';
  bool _pending = false;
  String? _error;
  Map<String, String> _fieldErrors = {};
  int _generation = 0;

  void _reset(VendorSettings settings) {
    _baseline = settings;
    _draft = _SettingsDraft(settings);
    _baselineSignature = _draft!.signature;
    _fieldErrors = {};
    _error = null;
    _generation++;
  }

  bool get _dirty => _draft != null && _draft!.signature != _baselineSignature;

  Future<void> _publish(StudioSnapshot data) async {
    final draft = _draft!;
    final baseline = _baseline!;
    if (_pending) return;
    if (data.settings.version > baseline.version) {
      setState(
        () => _error =
            'Shop settings changed in another session. Load the latest settings before publishing your draft.',
      );
      return;
    }
    final fee = rupeesToPaise(draft.giftWrapFee);
    final numbers = {
      'maxCartQuantity': int.tryParse(draft.maxUnits.trim()),
      'qrResetSeconds': int.tryParse(draft.qrReset.trim()),
      'lowStockThreshold': int.tryParse(draft.lowStock.trim()),
    };
    final local = <String, String>{
      if (fee == null) 'giftWrapFeePaise': 'Enter a valid gift-wrap fee.',
      for (final MapEntry(:key, :value) in numbers.entries)
        if (value == null) key: 'Enter a whole number.',
    };
    if (local.isNotEmpty) {
      setState(() {
        _fieldErrors = local;
        _error = 'Check the highlighted information and try again.';
      });
      _showErrors();
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
      _fieldErrors = {};
    });
    final store = ref.read(studioStoreProvider(widget.slug).notifier);
    VendorSettings? saved;
    final failure = await store.guard(() async {
      saved = await store.api.updateSettings(
        VendorSettings(
          shopName: draft.shopName,
          ownerWhatsAppNumber: draft.whatsapp,
          defaultCountryCode: draft.countryCode.trim(),
          kioskName: draft.kioskName,
          maxCartQuantity: numbers['maxCartQuantity']!,
          giftWrapFeePaise: fee!,
          qrResetSeconds: numbers['qrResetSeconds']!,
          showPreviewLabel: draft.previewLabel,
          storeOpen: draft.storeOpen,
          lowStockThreshold: numbers['lowStockThreshold']!,
          version: baseline.version,
          updatedAt: baseline.updatedAt,
        ),
      );
    });
    if (!mounted) return;
    setState(() => _pending = false);
    if (saved != null) {
      store.commitSettings(saved!);
      setState(() => _reset(saved!));
      showToast(context, 'Shop settings published to the kiosk.');
      return;
    }
    if (failure == null || failure.handled) return;
    if (failure is HttpFailure && failure.code == 'VERSION_CONFLICT') {
      await store.refresh();
    }
    if (!mounted) return;
    setState(() {
      _error = failure.message;
      if (failure is HttpFailure) {
        _fieldErrors = {
          for (final MapEntry(:key, :value) in failure.fields.entries)
            if (value.isNotEmpty) key: value.first,
        };
      }
    });
    _showErrors();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: StudioAppBar(slug: widget.slug, title: 'Shop settings'),
      body: StudioBody(
        slug: widget.slug,
        builder: (context, data) {
          if (_draft == null) _reset(data.settings);
          return _form(context, data);
        },
      ),
    );
  }

  Widget _field(
    String key,
    String label, {
    required String value,
    required ValueChanged<String> onChanged,
    TextInputType? keyboard,
    String? helper,
    String? prefix,
    int? maxLength,
  }) {
    final error = _fieldErrors[key];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        key: ValueKey('$key-$_generation'),
        initialValue: value,
        keyboardType: keyboard,
        maxLength: maxLength,
        decoration: InputDecoration(
          labelText: label,
          prefixText: prefix,
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

  Widget _form(BuildContext context, StudioSnapshot data) {
    final draft = _draft!;
    final baseline = _baseline!;
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final newer = data.settings.version > baseline.version;
    final testLink = whatsAppTestLink(draft.whatsapp, draft.countryCode);

    return ListView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (newer) ...[
          CautionNote(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'A newer settings revision is available. Your unsaved draft is still here.',
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => setState(() => _reset(data.settings)),
                  child: const Text('Load latest settings'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (_error != null) ...[InlineError(_error!), const SizedBox(height: 12)],
        SectionCard(
          title: 'Store profile',
          subtitle: 'Shown on the kiosk and in every WhatsApp order.',
          child: Column(
            children: [
              _field(
                'shopName',
                'Shop name',
                value: draft.shopName,
                maxLength: 80,
                onChanged: (v) => draft.shopName = v,
              ),
              _field(
                'kioskName',
                'Kiosk name',
                value: draft.kioskName,
                maxLength: 80,
                onChanged: (v) => draft.kioskName = v,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: draft.storeOpen,
                onChanged: (value) => setState(() => draft.storeOpen = value),
                title: const Text('Accept kiosk orders'),
                subtitle: const Text('Pause ordering without hiding your product catalogue.'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'WhatsApp handoff',
          subtitle: 'Kiosk orders open a WhatsApp chat with this number.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LayoutBuilder(
                builder: (context, constraints) {
                  final countryCode = _field(
                    'defaultCountryCode',
                    'Country code',
                    value: draft.countryCode,
                    prefix: '+ ',
                    maxLength: 3,
                    keyboard: TextInputType.number,
                    onChanged: (v) => draft.countryCode = v,
                  );
                  final number = _field(
                    'ownerWhatsAppNumber',
                    'Owner WhatsApp number',
                    value: draft.whatsapp,
                    maxLength: 24,
                    keyboard: TextInputType.phone,
                    onChanged: (v) => draft.whatsapp = v,
                  );
                  // On a phone, side by side would cut the labels short.
                  if (constraints.maxWidth < 420) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: 168, child: countryCode),
                        number,
                      ],
                    );
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 168, child: countryCode),
                      const SizedBox(width: 10),
                      Expanded(child: number),
                    ],
                  );
                },
              ),
              const CautionNote(
                child: Text(
                  'Customers still check the message and tap Send themselves. Scanning the QR '
                  "code doesn't send anything.",
                ),
              ),
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: testLink == null
                      ? null
                      : () => launchUrl(testLink, mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.chat_outlined, size: 18),
                  label: const Text('Test WhatsApp destination'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Ordering rules',
          subtitle: 'Limits that apply to every kiosk order.',
          child: Column(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _field(
                      'maxCartQuantity',
                      'Maximum gift units',
                      value: draft.maxUnits,
                      helper: 'Between 1 and 5.',
                      keyboard: TextInputType.number,
                      onChanged: (v) => draft.maxUnits = v,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _field(
                      'giftWrapFeePaise',
                      'Gift-wrap fee (₹)',
                      value: draft.giftWrapFee,
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (v) => draft.giftWrapFee = v,
                    ),
                  ),
                ],
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _field(
                      'qrResetSeconds',
                      'QR privacy reset (seconds)',
                      value: draft.qrReset,
                      helper: '15 to 3,600.',
                      keyboard: TextInputType.number,
                      onChanged: (v) => draft.qrReset = v,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _field(
                      'lowStockThreshold',
                      'Low-stock alert at',
                      value: draft.lowStock,
                      helper: '0 to 999 units.',
                      keyboard: TextInputType.number,
                      onChanged: (v) => draft.lowStock = v,
                    ),
                  ),
                ],
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: draft.previewLabel,
                onChanged: (value) => setState(() => draft.previewLabel = value),
                title: const Text('Show preview label'),
                subtitle: const Text('Display the optional preview marker on the kiosk.'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: _dirty ? 'Settings are ready to update' : 'Everything is up to date',
          subtitle:
              'Revision ${baseline.version} · Last saved ${formatVendorDate(baseline.updatedAt)}',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PendingButton(
                label: 'Publish settings',
                pendingLabel: 'Publishing…',
                pending: _pending,
                icon: Icons.publish_outlined,
                onPressed: !_dirty || newer ? null : () => _publish(data),
              ),
              if (_dirty)
                TextButton(
                  onPressed: _pending ? null : () => setState(() => _reset(data.settings)),
                  child: const Text('Discard changes'),
                ),
              const SizedBox(height: 4),
              Text(
                'The kiosk picks up changes within 30 seconds.',
                style: text.bodySmall?.copyWith(color: colors.muted),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
