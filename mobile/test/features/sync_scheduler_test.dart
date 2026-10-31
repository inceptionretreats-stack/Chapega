import 'package:chapega_studio/core/api/api_failure.dart';
import 'package:chapega_studio/features/studio/sync_scheduler.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('syncs at once, then every 30 s in the background', () {
    fakeAsync((async) {
      final runs = <bool>[];
      final scheduler = SyncScheduler(
        refresh: ({required background}) async => runs.add(background),
        lastFailure: () => null,
      )..start();
      async.elapse(Duration.zero);
      expect(runs, [false]);
      async.elapse(const Duration(seconds: 30));
      expect(runs, [false, true]);
      async.elapse(const Duration(seconds: 30));
      expect(runs, [false, true, true]);
      scheduler.dispose();
      async.elapse(const Duration(minutes: 5));
      expect(runs, hasLength(3));
    });
  });

  test('backs off after failures and honours Retry-After', () {
    fakeAsync((async) {
      final runs = <Duration>[];
      ApiFailure? failure = const NetworkFailure();
      final scheduler = SyncScheduler(
        refresh: ({required background}) async => runs.add(async.elapsed),
        lastFailure: () => failure,
      )..start();
      async.elapse(Duration.zero);
      async.elapse(const Duration(minutes: 10));
      // 0, then +30 s, +60 s, +120 s, +300 s, +300 s …
      expect(runs.take(5).toList(), [
        Duration.zero,
        const Duration(seconds: 30),
        const Duration(seconds: 90),
        const Duration(seconds: 210),
        const Duration(seconds: 510),
      ]);

      failure = const HttpFailure(
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Slow down.',
        retryAfter: Duration(seconds: 7),
      );
      runs.clear();
      scheduler.syncNow();
      async.elapse(const Duration(seconds: 7));
      expect(runs, hasLength(2));
      scheduler.dispose();
    });
  });
}
