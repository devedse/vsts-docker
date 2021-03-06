var del = require("del");
var fs = require('fs');
var gulp = require("gulp");
var istanbul = require("gulp-istanbul");
var mocha = require("gulp-mocha");
var path = require("path");
var shell = require("shelljs");
var tsb = require("gulp-tsb");
var tslint = require("gulp-tslint");

var buildDirectory = "_build";
var srcBuildDirectory = "_build/src";
var codeCoverageDirectory = buildDirectory + "/codeCoverage";
var packageDirectory = buildDirectory + "/package";
var sourcePaths = {
    typescriptFiles: "src/**/*.ts",
    copyFiles: ["src/**/*", "!src/**/*.ts"],
    lcaFiles: ["ThirdPartyNotices.txt", "DockerIntegration_ExtensionForVisualStudioTeamServices_Pre-ReleaseEULA.docx"],
    tasksPath: "src/tasks"
};
var testPaths = {
    typescriptFiles: "tests/**/*.ts",
    compiledTestFiles: buildDirectory + "/tests/**/*Tests.js"
};
var packageManifestFile = "vss-extension.json";
var nodeModulesDirectory = "node_modules";

var compilation = tsb.create({
    target: 'es5',
    module: 'commonjs',
    declaration: false,
    verbose: false
});

gulp.task("clean", function () {
    return del([buildDirectory]);
});

gulp.task("lint", ["clean"], function () {
    return gulp.src([sourcePaths.typescriptFiles, testPaths.typescriptFiles])
        .pipe(tslint())
        .pipe(tslint.report("verbose"));
});

gulp.task("compile", ["lint"], function () {
    return gulp.src([sourcePaths.typescriptFiles, testPaths.typescriptFiles], { base: "." })
        .pipe(compilation())
        .pipe(gulp.dest(buildDirectory))
        .pipe(istanbul({ includeUntested: true }))
        .pipe(istanbul.hookRequire());
});

gulp.task("build", ["compile"], function () {
    return gulp.src(sourcePaths.copyFiles.concat(sourcePaths.lcaFiles), { base: "." })
        .pipe(gulp.dest(buildDirectory));
});

gulp.task("test", ["build"], function () {
    shell.chmod(755, 'pytests.sh');
    shell.exec('./pytests.sh');
    shell.rm('./r.sh');

    return gulp.src(testPaths.compiledTestFiles, { read: false })
        .pipe(mocha())
        .pipe(istanbul.writeReports({ dir: codeCoverageDirectory }))
        .pipe(istanbul.enforceThresholds({ thresholds: { global: 100 } }));
});

gulp.task("default", ["build"]);

gulp.task("package", ["build"], function () {
    getNodeDependencies(function () {
        copyLcaFiles();
        copyNodeModulesToTasks();
        createVsixPackage();
    });
});

var getNodeDependencies = function (callback) {
    del(packageDirectory);
    shell.mkdir("-p", path.join(packageDirectory, nodeModulesDirectory));
    shell.cp("-f", "package.json", packageDirectory);
    shell.pushd(packageDirectory);

    var npmPath = shell.which("npm");
    var npmInstallCommand = '"' + npmPath + '" install --production';
    executeCommand(npmInstallCommand, function () {
        shell.popd();
        callback();
    });
}

var copyLcaFiles = function () {
    gulp.src(sourcePaths.lcaFiles, { base: "." })
        .pipe(gulp.dest(srcBuildDirectory));

    fs.readdirSync(sourcePaths.tasksPath).forEach(function (taskName) {
        var taskpath = path.join(buildDirectory, sourcePaths.tasksPath, taskName);
        gulp.src(sourcePaths.lcaFiles, { base: "." })
            .pipe(gulp.dest(taskpath));
    })
}

var copyNodeModulesToTasks = function () {
    fs.readdirSync(sourcePaths.tasksPath).forEach(function (taskName) {
        var taskpath = path.join(buildDirectory, sourcePaths.tasksPath, taskName);
        del(path.join(taskpath, nodeModulesDirectory));
        shell.cp("-rf", path.join(packageDirectory, nodeModulesDirectory), taskpath);
    });
}

var createVsixPackage = function () {
    var packagingCmd = "tfx extension create --manifest-globs " + packageManifestFile + " --root " + srcBuildDirectory + " --output-path " + packageDirectory;
    executeCommand(packagingCmd, function () { });
}

var executeCommand = function (cmd, callback) {
    shell.exec(cmd, { silent: true }, function (code, output) {
        if (code != 0) {
            console.error("command failed: " + cmd + "\nManually execute to debug");
        }
        else {
            callback();
        }
    });
}