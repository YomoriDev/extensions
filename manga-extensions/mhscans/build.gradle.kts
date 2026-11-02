plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "eu.kanade.tachiyomi.extension.es.mhscans"
    compileSdk = 36

    defaultConfig {
        applicationId = "eu.kanade.tachiyomi.extension.es.mhscans"
        minSdk = 26
        targetSdk = 36
        // Must be higher than the published one (104066) for the app to offer the update
        versionCode = 104067
        // "1.4.x": the part before the last dot is the extension lib version the app checks
        versionName = "1.4.67"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Debug-signed here. The publish script signs it with the Yomori keystore before it goes out.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // Provided by the app at runtime: the manga source API and the network helpers
    compileOnly(files("../libs/zentu-source-api.jar", "../libs/zentu-core-common.jar"))
    compileOnly("org.jetbrains.kotlin:kotlin-stdlib:2.4.20")
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    compileOnly("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    compileOnly("com.squareup.okhttp3:okhttp:5.3.2")
    compileOnly("org.jsoup:jsoup:1.23.2")
    compileOnly("io.reactivex:rxjava:1.3.8")
    compileOnly("androidx.preference:preference-ktx:1.2.1")
    compileOnly("com.github.mihonapp:injekt:91edab2317")
}
