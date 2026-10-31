import 'package:flutter/material.dart';

/// The app-wide snackbar host, for messages that outlive the screen that
/// triggered them (e.g. after sign-in navigates away).
final appMessengerKey = GlobalKey<ScaffoldMessengerState>();

void showAppToast(String message) {
  final messenger = appMessengerKey.currentState;
  messenger?.hideCurrentSnackBar();
  messenger?.showSnackBar(
    SnackBar(content: Text(message), duration: const Duration(milliseconds: 4000)),
  );
}
