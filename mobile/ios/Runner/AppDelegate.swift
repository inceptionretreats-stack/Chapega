import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let privacyCover = PrivacyCover()

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    privacyCover.install()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}

/// Order screens show customer names and phone numbers: cover the app while
/// it is not active, so the app switcher's snapshot never shows them. The
/// Android side is setRecentsScreenshotEnabled(false) in MainActivity.
final class PrivacyCover {
  private var covers: [ObjectIdentifier: UIView] = [:]

  func install() {
    let center = NotificationCenter.default
    center.addObserver(
      forName: UIScene.willDeactivateNotification, object: nil, queue: .main
    ) { [weak self] notification in
      guard let scene = notification.object as? UIWindowScene else { return }
      self?.cover(scene)
    }
    center.addObserver(
      forName: UIScene.didActivateNotification, object: nil, queue: .main
    ) { [weak self] notification in
      guard let scene = notification.object as? UIWindowScene else { return }
      self?.uncover(scene)
    }
  }

  private func cover(_ scene: UIWindowScene) {
    let key = ObjectIdentifier(scene)
    guard covers[key] == nil,
      let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first
    else { return }

    let view = UIView(frame: window.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.backgroundColor = UIColor(red: 0x7A / 255, green: 0x26 / 255, blue: 0x3A / 255, alpha: 1)
    let label = UILabel()
    label.text = "Chapega Studio"
    label.font = .systemFont(ofSize: 22, weight: .semibold)
    label.textColor = UIColor(red: 0xFF / 255, green: 0xF9 / 255, blue: 0xF2 / 255, alpha: 1)
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
    window.addSubview(view)
    covers[key] = view
  }

  private func uncover(_ scene: UIWindowScene) {
    covers.removeValue(forKey: ObjectIdentifier(scene))?.removeFromSuperview()
  }
}
