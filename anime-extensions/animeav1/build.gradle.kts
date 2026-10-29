plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "eu.kanade.tachiyomi.animeextension.es.animeav1"
    compileSdk = 36

    defaultConfig {
        applicationId = "eu.kanade.tachiyomi.animeextension.es.animeav1"
        minSdk = 26
        targetSdk = 36
        // versionName "17.x": the part before the last dot is the extension lib version the app checks
        versionCode = 2
        versionName = "17.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Debug-signed so debug builds of ZENTU accept it. Re-sign with the Yomori keystore before publishing.
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
    // Provided by the app at runtime: the anime source API and the network helpers
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
