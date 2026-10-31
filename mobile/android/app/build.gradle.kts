import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing comes from android/key.properties (git-ignored; see
// mobile/docs/RELEASE.md). Without it, release builds use the debug key so
// `flutter build apk --release` still works on any machine and in CI.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

// Values passed with --dart-define / --dart-define-from-file reach Gradle as
// base64 "KEY=value" pairs in the dart-defines property.
val dartDefines: Map<String, String> =
    (project.findProperty("dart-defines") as String?)
        ?.split(",")
        ?.mapNotNull { encoded ->
            val decoded = String(Base64.getDecoder().decode(encoded), Charsets.UTF_8)
            val separator = decoded.indexOf('=')
            if (separator <= 0) null else decoded.substring(0, separator) to decoded.substring(separator + 1)
        }
        ?.toMap()
        ?: emptyMap()

android {
    namespace = "com.chapega.studio"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications uses java.time APIs on older Android versions.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.chapega.studio"
        // flutter_secure_storage needs API 23; the app supports Android 7.0 (API 24) and later.
        minSdk = maxOf(flutter.minSdkVersion, 24)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Firebase without google-services.json: the same string resources the
        // Google Services plugin would generate, built from the git-ignored
        // config/firebase.json (passed with --dart-define-from-file). Without
        // those values push stays off and nothing Firebase-related is added.
        dartDefines["CHAPEGA_FIREBASE_ANDROID_APP_ID"]?.takeIf { it.isNotBlank() }?.let { appId ->
            resValue("string", "google_app_id", appId)
            resValue("string", "gcm_defaultSenderId", dartDefines["CHAPEGA_FIREBASE_SENDER_ID"].orEmpty())
            resValue("string", "google_api_key", dartDefines["CHAPEGA_FIREBASE_ANDROID_API_KEY"].orEmpty())
            resValue("string", "project_id", dartDefines["CHAPEGA_FIREBASE_PROJECT_ID"].orEmpty())
        }
    }

    signingConfigs {
        if (keystoreProperties.isNotEmpty()) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (keystoreProperties.isNotEmpty()) signingConfigs.getByName("release")
                else signingConfigs.getByName("debug")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
