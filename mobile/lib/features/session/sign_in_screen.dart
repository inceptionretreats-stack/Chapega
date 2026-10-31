import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_messenger.dart';
import '../../bootstrap/providers.dart';
import '../../core/api/api_failure.dart';
import '../../routing/pending_deep_link.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../../ui/wordmark.dart';
import 'session_controller.dart';
import 'session_state.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  bool _pending = false;
  bool _obscure = true;
  String? _error;
  String? _emailError;
  String? _passwordError;
  int _secondsLeft = 0;
  Timer? _countdown;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _countdown?.cancel();
    super.dispose();
  }

  /// Counts timer ticks rather than reading the clock, so a change to the
  /// phone's time can't stretch or skip the wait.
  void _startCountdown(Duration wait) {
    _secondsLeft = wait.inSeconds < 1 ? 1 : wait.inSeconds;
    _countdown?.cancel();
    _countdown = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _secondsLeft--);
      if (_secondsLeft <= 0) timer.cancel();
    });
  }

  Future<void> _submit() async {
    if (_pending || _secondsLeft > 0) return;
    final email = _email.text.trim();
    final password = _password.text;
    setState(() {
      _error = null;
      _emailError = email.isEmpty ? 'Enter your email address.' : null;
      _passwordError = password.isEmpty ? 'Enter your password.' : null;
    });
    if (_emailError != null) return _emailFocus.requestFocus();
    if (_passwordError != null) return _passwordFocus.requestFocus();

    setState(() => _pending = true);
    try {
      final result = await ref
          .read(sessionControllerProvider.notifier)
          .signIn(
            email: email,
            password: password,
            vendorSlug: ref.read(pendingDeepLinkProvider).slug,
          );
      TextInput.finishAutofillContext();
      if (result.signedOutDevices > 0) {
        showAppToast(
          result.signedOutDevices == 1
              ? 'Your oldest signed-in phone was signed out (limit reached).'
              : '${result.signedOutDevices} older phones were signed out (limit reached).',
        );
      }
    } on HttpFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure.message;
        if (failure.isRateLimited) {
          _startCountdown(failure.retryAfter ?? const Duration(seconds: 30));
        }
        _emailError = failure.field('email');
        _passwordError = failure.field('password');
      });
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(
        () => _error = failure is NetworkFailure
            ? 'The vendor service is unavailable. Check the connection and try again.'
            : failure.message,
      );
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final session = ref.watch(sessionControllerProvider);
    final notice = session is SignedOut ? session.notice : null;
    final secondsLeft = _secondsLeft;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Wordmark(size: 34, subtitle: 'Studio'),
                    ),
                    const SizedBox(height: 36),
                    Semantics(header: true, child: Text('Welcome back', style: text.headlineSmall)),
                    const SizedBox(height: 6),
                    Text(
                      'Sign in to manage your products, live orders, stock, and kiosk settings.',
                      style: text.bodyMedium?.copyWith(color: colors.muted),
                    ),
                    const SizedBox(height: 24),
                    if (notice != null && _error == null) ...[
                      CautionNote(child: Text(notice)),
                      const SizedBox(height: 16),
                    ],
                    if (_error != null) ...[InlineError(_error!), const SizedBox(height: 16)],
                    TextField(
                      controller: _email,
                      focusNode: _emailFocus,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      enableSuggestions: false,
                      maxLength: 160,
                      autofillHints: const [AutofillHints.username, AutofillHints.email],
                      decoration: InputDecoration(
                        labelText: 'Email address',
                        errorText: _emailError,
                        counterText: '',
                      ),
                      onChanged: (_) {
                        if (_emailError != null) setState(() => _emailError = null);
                      },
                      onSubmitted: (_) => _passwordFocus.requestFocus(),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _password,
                      focusNode: _passwordFocus,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      autocorrect: false,
                      enableSuggestions: false,
                      maxLength: 200,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: 'Password',
                        errorText: _passwordError,
                        counterText: '',
                        suffixIcon: IconButton(
                          onPressed: () => setState(() => _obscure = !_obscure),
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off),
                        ),
                      ),
                      onChanged: (_) {
                        if (_passwordError != null) setState(() => _passwordError = null);
                      },
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 22),
                    PendingButton(
                      label: secondsLeft > 0 ? 'Try again in $secondsLeft s' : 'Sign in',
                      pendingLabel: 'Signing in…',
                      pending: _pending,
                      icon: Icons.login,
                      onPressed: secondsLeft > 0 ? null : _submit,
                    ),
                    const SizedBox(height: 28),
                    Row(
                      children: [
                        Icon(Icons.lock_outline, size: 16, color: colors.muted),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'For shop owners, managers and staff. Your session stays on this phone.',
                            style: text.bodySmall,
                          ),
                        ),
                      ],
                    ),
                    if (!kReleaseMode) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Server: ${ref.watch(appConfigProvider).apiOrigin}',
                        style: text.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
