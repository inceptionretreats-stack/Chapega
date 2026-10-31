/// Every location in the app. Shop screens live under `/s/<slug>/…`, so a
/// notification or a shop switch is just a location.
abstract final class Routes {
  static const launch = '/launch';
  static const signIn = '/sign-in';
  static const password = '/password';
  static const shops = '/shops';

  static String _s(String slug) => '/s/${Uri.encodeComponent(slug)}';
  static String _id(String id) => Uri.encodeComponent(id);

  static String home(String slug) => '${_s(slug)}/home';
  static String orders(String slug) => '${_s(slug)}/orders';
  static String order(String slug, String id) => '${_s(slug)}/orders/${_id(id)}';
  static String products(String slug) => '${_s(slug)}/products';
  static String newProduct(String slug) => '${_s(slug)}/products/new';
  static String editProduct(String slug, String id) => '${_s(slug)}/products/${_id(id)}/edit';
  static String settings(String slug) => '${_s(slug)}/settings';
  static String more(String slug) => '${_s(slug)}/more';
  static String team(String slug) => '${_s(slug)}/more/team';
  static String addTeamMember(String slug) => '${_s(slug)}/more/team/add';
  static String changePassword(String slug) => '${_s(slug)}/more/password';
  static String notifications(String slug) => '${_s(slug)}/more/notifications';
  static String about(String slug) => '${_s(slug)}/more/about';

  /// Gate screens shown before the Studio opens.
  static const gates = {launch, signIn, password, shops};
}
