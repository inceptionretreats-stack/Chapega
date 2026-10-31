import 'dart:async';

import 'package:chapega_studio/features/products/product_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

Future<void> go(WidgetTester tester, String location) async {
  GoRouter.of(tester.element(find.byType(Navigator).first)).go(location);
  await tester.pumpAndSettle();
}

Future<void> push(WidgetTester tester, String location) async {
  unawaited(GoRouter.of(tester.element(find.byType(Navigator).first)).push(location));
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextField, label);

void main() {
  testWidgets('hides a product from the kiosk with one switch', (tester) async {
    final app = await pumpStudioApp(tester);
    await go(tester, '/s/chapega/products');
    final first = app.studio.snapshot.products.first;
    expect(first.visible, isTrue);

    await tester.tap(find.bySemanticsLabel('Hide ${first.name} on kiosk'));
    await tester.pumpAndSettle();

    expect(app.studio.calls, contains('updateProduct:${first.id}'));
    expect(app.studio.snapshot.product(first.id)!.visible, isFalse);
    expect(find.text('Product hidden from the kiosk.'), findsOneWidget);
  });

  testWidgets('edits a product and publishes the change', (tester) async {
    final app = await pumpStudioApp(tester);
    await push(tester, '/s/chapega/products/engraved-name-necklace/edit');
    expect(find.text('Edit product'), findsOneWidget);

    await tester.enterText(field('Price (₹)'), '1499');
    await tester.tap(find.widgetWithText(FilledButton, 'Save changes'));
    await tester.pumpAndSettle();

    expect(app.studio.snapshot.product('engraved-name-necklace')!.pricePaise, 149900);
    expect(find.text('Product changes published.'), findsOneWidget);
    expect(find.text('Edit product'), findsNothing);
  });

  testWidgets('a new product needs a photo, explained before anything is sent', (tester) async {
    final app = await pumpStudioApp(tester);
    await push(tester, '/s/chapega/products/new');
    await tester.enterText(field('Name'), 'Pressed flower frame');
    await tester.enterText(field('Short description'), 'A frame of pressed flowers.');
    await tester.enterText(field('Full description'), 'Real flowers, pressed and framed.');
    await tester.enterText(field('Price (₹)'), '899');
    await tester.tap(find.widgetWithText(FilledButton, 'Save product'));
    await tester.pumpAndSettle();

    expect(find.text('Add a clear product image before publishing this gift.'), findsOneWidget);
    expect(find.text('Choose a product image.'), findsOneWidget);
    expect(app.studio.calls.where((call) => call == 'createProduct'), isEmpty);
  });

  testWidgets('asks before discarding unsaved changes', (tester) async {
    await pumpStudioApp(tester);
    await push(tester, '/s/chapega/products/engraved-name-necklace/edit');
    await tester.enterText(field('Name'), 'Renamed necklace');
    await tester.pump();
    await tester.tap(find.byTooltip('Close product editor'));
    await tester.pumpAndSettle();
    expect(find.text('Discard your changes?'), findsOneWidget);
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.text('Edit product'), findsOneWidget);
  });

  testWidgets('offers a choice when someone else saved the product first', (tester) async {
    final app = await pumpStudioApp(tester);
    await push(tester, '/s/chapega/products/engraved-name-necklace/edit');
    // Another device saves it meanwhile.
    final current = app.studio.snapshot.product('engraved-name-necklace')!;
    await app.studio.updateProduct(current.id, current.toInput());

    await tester.enterText(field('Stock quantity'), '9');
    await tester.tap(find.widgetWithText(FilledButton, 'Save changes'));
    await tester.pumpAndSettle();
    expect(find.text('This product changed on another device'), findsOneWidget);
    await tester.tap(find.text('Keep my changes'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Save again to replace'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Save changes'));
    await tester.pumpAndSettle();
    expect(app.studio.snapshot.product('engraved-name-necklace')!.stock, 9);
  });

  testWidgets('archives a product after asking', (tester) async {
    final app = await pumpStudioApp(tester);
    await push(tester, '/s/chapega/products/engraved-name-necklace/edit');
    await tester.scrollUntilVisible(
      find.text('Archive'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Archive'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Archive product'));
    await tester.pumpAndSettle();
    expect(app.studio.snapshot.product('engraved-name-necklace'), isNull);
    expect(find.textContaining('Product archived'), findsOneWidget);
  });

  group('draft checks', () {
    ProductDraft draft() => ProductDraft.forProduct(null)
      ..name = 'Mug'
      ..shortDescription = 'A mug'
      ..description = 'A big mug'
      ..price = '499';

    test('options need unique names and a price that stays at or above ₹0', () {
      final check = validateDraft(
        draft()
          ..options = [
            OptionDraft(id: 'a', name: 'Large', adjustment: '0'),
            OptionDraft(id: 'b', name: 'large', adjustment: '-600'),
          ],
        image: '/products/mug.png',
        version: null,
      );
      expect(check.input, isNull);
      expect(check.options['a']!.name, 'Use a unique name for every option.');
      expect(check.options['b']!.adjustment, 'The final option price cannot be less than ₹0.');
      expect(check.message, 'Review the highlighted product options before saving.');
    });

    test('the compare-at price must be higher', () {
      final check = validateDraft(
        draft()..compareAtPrice = '499',
        image: '/products/mug.png',
        version: null,
      );
      expect(check.fields['compareAtPrice'], 'Must be higher than the selling price.');
    });

    test('a valid draft becomes the server input, tags split and deduplicated', () {
      final check = validateDraft(
        draft()
          ..tags = 'mug, gift, mug'
          ..options = [OptionDraft(id: 'x', name: 'Blue', adjustment: '50', stock: '')],
        image: '/products/mug.png',
        version: 3,
      );
      final body = check.input!.toJson();
      expect(body['pricePaise'], 49900);
      expect(body['tags'], ['mug', 'gift']);
      expect(body['version'], 3);
      expect((body['variants']! as List<Object?>).single, {
        'id': 'x',
        'name': 'Blue',
        'priceAdjustmentPaise': 5000,
      });
    });
  });

  testWidgets('managers can edit products; staff are kept out', (tester) async {
    final session = FakeSessionApi(user: fakeUser(role: 'staff'));
    await pumpStudioApp(tester, session: session);
    await go(tester, '/s/chapega/products');
    expect(find.text('Welcome back, Aanya'), findsOneWidget);
  });
}
