val minecraft_version: String by project
val loader_version: String by project
val fabric_version: String by project
val mod_version: String by project

plugins {
    id("net.fabricmc.fabric-loom") version "1.15.5"
}

version = mod_version
group = "watita.sparringlink"
base { archivesName = "WatitaSparringLink" }

repositories {
    maven("https://maven.fabricmc.net/")
    mavenCentral()
}

java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(25)) }
}

dependencies {
    minecraft("com.mojang:minecraft:$minecraft_version")
    implementation("net.fabricmc:fabric-loader:$loader_version")
    implementation(fabricApi.module("fabric-api-base", fabric_version))
    implementation(fabricApi.module("fabric-lifecycle-events-v1", fabric_version))
    implementation(fabricApi.module("fabric-networking-api-v1", fabric_version))

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.4")
}

tasks.test { useJUnitPlatform() }

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 25
}

tasks.processResources {
    inputs.property("version", project.version)
    filesMatching("fabric.mod.json") { expand("version" to project.version) }
}
