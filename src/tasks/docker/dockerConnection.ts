"use strict";

import * as del from "del";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as tl from "vsts-task-lib/task";
import * as tr from "vsts-task-lib/toolrunner";
import * as imageUtils from "./dockerImageUtils";

export default class DockerConnection {
    private dockerPath: string;
    private hostUrl: string;
    private certsDir: string;
    private caPath: string;
    private certPath: string;
    private keyPath: string;
    private registryAuth: { [key: string]: string };
    private loggedIn: boolean;

    constructor() {
        this.dockerPath = tl.which("docker", true);
    }

    private createBaseCommand(): tr.ToolRunner {
        return tl.tool(this.dockerPath);
    }

    protected addAuthArgs(command: tr.ToolRunner): void {
        if (this.hostUrl) {
            command.arg(["-H", this.hostUrl]);
            command.arg("--tls");
            command.arg("--tlscacert='" + this.caPath + "'");
            command.arg("--tlscert='" + this.certPath + "'");
            command.arg("--tlskey='" + this.keyPath + "'");
        }
    }

    public createCommand(): tr.ToolRunner {
        var command = this.createBaseCommand();
        this.addAuthArgs(command);
        return command;
    }

    public open(hostEndpoint?: string, registryEndpoint?: string): void {
        if (hostEndpoint) {
            this.hostUrl = tl.getEndpointUrl(hostEndpoint, false);

            this.certsDir = path.join("", ".dockercerts");
            if (!fs.existsSync(this.certsDir)) {
                fs.mkdirSync(this.certsDir);
            }

            var authDetails = tl.getEndpointAuthorization(hostEndpoint, false).parameters;

            this.caPath = path.join(this.certsDir, "ca.pem");
            fs.writeFileSync(this.caPath, authDetails["cacert"]);

            this.certPath = path.join(this.certsDir, "cert.pem");
            fs.writeFileSync(this.certPath, authDetails["cert"]);

            this.keyPath = path.join(this.certsDir, "key.pem");
            fs.writeFileSync(this.keyPath, authDetails["key"]);
        }

        if (registryEndpoint) {
            var command = this.createCommand();
            this.registryAuth = tl.getEndpointAuthorization(registryEndpoint, true).parameters;
            if (this.registryAuth) {
                command.arg("login");
                command.arg(["-u", this.registryAuth["username"]]);
                command.arg(["-p", this.registryAuth["password"]]);
                command.arg(this.registryAuth["registry"]);
                command.execSync();
                this.loggedIn = true;
            }
        }
    }

    public getFullImageName(imageName: string) {
        if (this.registryAuth) {
            var regUrl = url.parse(this.registryAuth["registry"]),
                hostname = !regUrl.slashes ? regUrl.href : regUrl.host,
                username = this.registryAuth["username"],
                slashIndex = imageName.indexOf("/");
            if (hostname.toLowerCase() === "index.docker.io") {
                hostname = "";
            } else {
                hostname = hostname + "/";
            }
            if (slashIndex < 0) {
                imageName = hostname + username + "/" + imageName;
            } else if (!imageUtils.hasRegistryComponent(imageName)) {
                imageName = hostname + imageName;
            }
        }
        return imageName;
    }

    public close(): void {
        if (this.loggedIn) {
            var command = this.createCommand();
            command.arg("logout");
            command.execSync();
        }
        if (this.certsDir && fs.existsSync(this.certsDir)) {
            del.sync(this.certsDir);
        }
    }
}
