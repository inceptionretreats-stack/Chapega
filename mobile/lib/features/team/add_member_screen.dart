import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../../domain/team.dart';
import '../../models/team_member.dart';
import '../../ui/feedback.dart';
import '../studio/studio_store.dart';
import 'temporary_password.dart';

/// Add a manager or staff member with a temporary password they replace at
/// their first sign-in.
class AddMemberScreen extends ConsumerStatefulWidget {
  const AddMemberScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<AddMemberScreen> createState() => _AddMemberScreenState();
}

class _AddMemberScreenState extends ConsumerState<AddMemberScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  VendorRole _role = VendorRole.staff;
  bool _pending = false;
  String? _error;
  Map<String, String> _fieldErrors = {};
  TeamMember? _added;

  String get _shopName =>
      ref.read(studioStoreProvider(widget.slug)).data?.vendor.displayName ?? 'this shop';

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_pending) return;
    final local = <String, String>{
      if (_name.text.trim().length < 2) 'name': 'Enter their name.',
      if (!_email.text.contains('@')) 'email': 'Enter their email address.',
      if (_password.text.isEmpty) 'temporaryPassword': 'Choose or generate a temporary password.',
    };
    if (local.isNotEmpty) {
      setState(() => _fieldErrors = local);
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
      _fieldErrors = {};
    });
    final store = ref.read(studioStoreProvider(widget.slug).notifier);
    TeamMember? added;
    final failure = await store.guard(
      () async => added = await store.api.addTeamMember(
        name: _name.text,
        email: _email.text,
        role: _role,
        temporaryPassword: _password.text,
      ),
    );
    if (!mounted) return;
    setState(() {
      _pending = false;
      _added = added;
      if (failure != null && !failure.handled) {
        if (failure is HttpFailure) {
          _fieldErrors = {
            for (final MapEntry(:key, :value) in failure.fields.entries)
              if (value.isNotEmpty) key: value.first,
            if (failure.code == 'ALREADY_ON_TEAM' || failure.code == 'EMAIL_UNAVAILABLE')
              'email': failure.message,
          };
        }
        _error = _fieldErrors.isEmpty ? failure.message : null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final added = _added;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(added == null ? 'Add a team member' : '${added.name} was added')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: added != null
            ? [
                IssuedCredentials(
                  name: added.name,
                  email: added.email,
                  password: _password.text,
                  shopName: _shopName,
                  onDone: () => Navigator.of(context).pop(added),
                ),
              ]
            : [
                Text(
                  'They can sign in to $_shopName with the email and temporary password you set '
                  'here.',
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 16),
                if (_error != null) ...[InlineError(_error!), const SizedBox(height: 12)],
                TextField(
                  controller: _name,
                  maxLength: 80,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'Name',
                    errorText: _fieldErrors['name'],
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _email,
                  maxLength: 160,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: InputDecoration(
                    labelText: 'Email',
                    errorText: _fieldErrors['email'],
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 14),
                Text('Role', style: text.titleSmall),
                RadioGroup<VendorRole>(
                  groupValue: _role,
                  onChanged: (role) => setState(() => _role = role ?? _role),
                  child: Column(
                    children: [
                      for (final role in VendorRole.assignable)
                        RadioListTile<VendorRole>(
                          value: role,
                          contentPadding: EdgeInsets.zero,
                          title: Text(role.label),
                          subtitle: Text(role.summary),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                TemporaryPasswordField(
                  controller: _password,
                  error: _fieldErrors['temporaryPassword'],
                  onChanged: () =>
                      setState(() => _fieldErrors = {..._fieldErrors}..remove('temporaryPassword')),
                ),
                const SizedBox(height: 16),
                PendingButton(
                  label: 'Add to team',
                  pendingLabel: 'Adding…',
                  pending: _pending,
                  icon: Icons.person_add_alt,
                  onPressed: _submit,
                ),
              ],
      ),
    );
  }
}
