import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_failure.dart';
import '../../domain/team.dart';
import '../../models/team_member.dart';
import '../../routing/routes.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_store.dart';
import 'temporary_password.dart';

/// The shop's team (owners only): who can sign in, and what they can do.
class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> {
  List<TeamMember>? _members;
  String? _loadError;
  String? _error;
  String? _busy;

  StudioStore get _store => ref.read(studioStoreProvider(widget.slug).notifier);

  String get _shopName =>
      ref.read(studioStoreProvider(widget.slug)).data?.vendor.displayName ?? 'this shop';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    List<TeamMember>? members;
    final failure = await _store.guard(() async => members = await _store.api.team());
    if (!mounted) return;
    setState(() {
      if (members != null) _members = members;
      if (failure != null && !failure.handled) _loadError = failure.message;
    });
  }

  void _replace(TeamMember member) {
    final members = _members ?? [];
    _members = members.any((m) => m.userId == member.userId)
        ? [for (final m in members) m.userId == member.userId ? member : m]
        : [...members, member];
  }

  Future<void> _change(
    TeamMember member,
    Future<TeamMember> Function() action,
    String message,
  ) async {
    if (_busy != null) return;
    setState(() {
      _busy = member.userId;
      _error = null;
    });
    TeamMember? saved;
    final failure = await _store.guard(() async => saved = await action());
    if (!mounted) return;
    setState(() {
      _busy = null;
      if (saved != null) _replace(saved!);
    });
    if (saved != null) {
      showToast(context, message);
    } else if (failure != null && !failure.handled) {
      setState(() => _error = failure.message);
      if (failure is HttpFailure && failure.isConflict) await _load();
    }
  }

  Future<void> _removeAccess(TeamMember member) async {
    final shop = _shopName;
    final confirmed = await confirmAction(
      context,
      title: "Remove ${member.name}'s access?",
      message:
          "${member.name} is signed out of $shop now and can't sign in to it until you give "
          'access again. Their past orders and history stay.',
      confirmLabel: 'Remove access',
      cancelLabel: 'Keep access',
    );
    if (!confirmed) return;
    await _change(
      member,
      () => _store.api.setTeamMemberActive(member.userId, active: false),
      '${member.name} no longer has access to $shop.',
    );
  }

  Future<void> _resetPassword(TeamMember member) async {
    final issued = await Navigator.of(context).push<TeamMember>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (context) =>
            TemporaryPasswordScreen(slug: widget.slug, member: member, shopName: _shopName),
      ),
    );
    if (issued != null && mounted) setState(() => _replace(issued));
  }

  @override
  Widget build(BuildContext context) {
    final members = _members;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: StudioAppBar(slug: widget.slug, title: 'Team', showSync: false),
      floatingActionButton: members == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () async {
                final added = await context.push<TeamMember>(Routes.addTeamMember(widget.slug));
                if (added != null && mounted) setState(() => _replace(added));
              },
              icon: const Icon(Icons.person_add_alt),
              label: const Text('Add member'),
            ),
      body: _loadError != null && members == null
          ? Center(
              child: EmptyState(
                icon: Icons.cloud_off_outlined,
                title: 'The team could not be loaded',
                message: _loadError!,
                action: OutlinedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try again'),
                ),
              ),
            )
          : members == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                children: [
                  Text(
                    'Owners can add managers and staff. Managers handle orders and products; '
                    'staff handle orders.',
                    style: text.bodyMedium?.copyWith(color: context.colors.muted),
                  ),
                  const SizedBox(height: 12),
                  if (_error != null) ...[InlineError(_error!), const SizedBox(height: 12)],
                  for (final member in members) ...[
                    _MemberCard(
                      member: member,
                      busy: _busy == member.userId,
                      onRole: (role) => _change(
                        member,
                        () => _store.api.setTeamMemberRole(member.userId, role),
                        '${member.name} is now ${role.label.toLowerCase()}.',
                      ),
                      onRemove: () => _removeAccess(member),
                      onRestore: () => _change(
                        member,
                        () => _store.api.setTeamMemberActive(member.userId, active: true),
                        '${member.name} can sign in to $_shopName again.',
                      ),
                      onReset: () => _resetPassword(member),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
              ),
            ),
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({
    required this.member,
    required this.busy,
    required this.onRole,
    required this.onRemove,
    required this.onRestore,
    required this.onReset,
  });

  final TeamMember member;
  final bool busy;
  final ValueChanged<VendorRole> onRole;
  final VoidCallback onRemove;
  final VoidCallback onRestore;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final stateColor = !member.active
        ? colors.muted
        : member.passwordChangePending
        ? colors.warningText
        : colors.successText;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    member.name,
                    style: text.titleMedium,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (member.isCurrentUser) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: colors.selected,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text('You', style: text.labelSmall?.copyWith(color: colors.textAccent)),
                  ),
                ],
              ],
            ),
            Text(member.email, style: text.bodySmall),
            const SizedBox(height: 8),
            Row(
              children: [
                if (member.canManage && member.active)
                  DropdownButton<VendorRole>(
                    value: member.role,
                    onChanged: busy ? null : (role) => role == member.role ? null : onRole(role!),
                    items: [
                      for (final role in VendorRole.assignable)
                        DropdownMenuItem(value: role, child: Text(role.label)),
                    ],
                  )
                else
                  Text(member.role.label, style: text.titleSmall),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    member.stateLabel,
                    style: text.labelMedium?.copyWith(color: stateColor),
                  ),
                ),
                if (busy) ...[
                  const SizedBox(width: 8),
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ],
              ],
            ),
            if (member.canManage) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (member.active)
                    TextButton.icon(
                      onPressed: busy ? null : onRemove,
                      icon: const Icon(Icons.person_remove_outlined, size: 18),
                      label: const Text('Remove access'),
                    )
                  else
                    TextButton.icon(
                      onPressed: busy ? null : onRestore,
                      icon: const Icon(Icons.how_to_reg_outlined, size: 18),
                      label: const Text('Give access again'),
                    ),
                  if (member.canResetPassword && member.active)
                    TextButton.icon(
                      onPressed: busy ? null : onReset,
                      icon: const Icon(Icons.key_outlined, size: 18),
                      label: const Text('Set temporary password'),
                    ),
                ],
              ),
              if (!member.canResetPassword && member.active)
                Text(
                  'Also on another shop: they change their own password.',
                  style: text.bodySmall,
                ),
            ],
          ],
        ),
      ),
    );
  }
}
