import argparse
import logging
import sys
import traceback

import dockercomposeparser
from clusterinfo import ClusterInfo
from registryinfo import RegistryInfo
from groupinfo import GroupInfo


class VstsLogFormatter(logging.Formatter):
    error_format = logging.Formatter('##[error]%(message)s')
    warning_format = logging.Formatter('##[warning]%(message)s')
    debug_format = logging.Formatter('##[debug]%(message)s')
    default_format = logging.Formatter('%(message)s')

    def format(self, record):
        if record.levelno == logging.ERROR:
            return self.error_format.format(record)
        elif record.levelno == logging.WARNING:
            return self.warning_format.format(record)
        elif record.levelno == logging.DEBUG:
            return self.debug_format.format(record)
        return self.default_format.format(record)


def get_arg_parser():
    """
    Sets up the argument parser
    """
    parser = argparse.ArgumentParser(
        description='Translate docker-compose.yml file to marathon.json file',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)

    parser.add_argument('--compose-file',
                        help='[required] Docker-compose.yml file')
    parser.add_argument('--api-endpoint-url',
                        help='API endpoint URL')
    parser.add_argument('--orchestrator',
                        help='Orchestrator type (DCOS or Kubernetes)')

    parser.add_argument('--group-name',
                        help='[required] Application group name')
    parser.add_argument('--group-qualifier',
                        help='[required] Application group qualifier')
    parser.add_argument('--group-version',
                        help='[required] Application group version')
    parser.add_argument('--deploy-ingress-controller',
                        help='[required] Should Ingress controller be deployed or not',
                        dest='deploy_ingress_controller', action='store_true')

    parser.add_argument('--registry-host',
                        help='Registry host (e.g. myregistry.azurecr-test.io:1234)')
    parser.add_argument('--registry-username',
                        help='Registry username')
    parser.add_argument('--registry-password',
                        help='Registry password')

    parser.add_argument('--acs-host',
                        help='ACS host')
    parser.add_argument('--acs-port',
                        help='ACS username')
    parser.add_argument('--acs-username',
                        help='ACS username')
    parser.add_argument('--acs-password',
                        help='ACS password')
    parser.add_argument('--acs-private-key',
                        help='ACS private key')

    parser.add_argument('--verbose',
                        help='Turn on verbose logging',
                        action='store_true')
    return parser


def process_arguments():
    """
    Makes sure required arguments are provided
    """
    arg_parser = get_arg_parser()
    args = arg_parser.parse_args()

    if args.compose_file is None:
        arg_parser.error('argument --compose-file is required')
    if args.group_name is None:
        arg_parser.error('argument --group-name is required')
    if args.group_qualifier is None:
        arg_parser.error('argument --group-qualifier is required')
    if args.group_version is None:
        arg_parser.error('argument --group-version is required')
    return args


def init_logger(verbose):
    """
    Initializes the logger and sets the custom formatter for VSTS
    """
    logging_level = logging.DEBUG if verbose else logging.INFO
    vsts_formatter = VstsLogFormatter()
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(vsts_formatter)
    logging.root.name = 'ACS-Deploy'
    logging.root.setLevel(logging_level)
    logging.root.addHandler(stream_handler)

    # Don't show INFO log messages from requests library
    logging.getLogger("requests").setLevel(logging.WARNING)

if __name__ == '__main__':
    arguments = process_arguments()
    init_logger(arguments.verbose)

    cluster_info = ClusterInfo(
        arguments.acs_host, arguments.acs_port, arguments.acs_username, arguments.acs_password,
        arguments.acs_private_key, arguments.api_endpoint_url, arguments.orchestrator)

    registry_info = RegistryInfo(
        arguments.registry_host, arguments.registry_username, arguments.registry_password)

    group_info = GroupInfo(arguments.group_name,
                           arguments.group_qualifier, arguments.group_version)

    try:
        with dockercomposeparser.DockerComposeParser(
                arguments.compose_file, cluster_info, registry_info, group_info, arguments.deploy_ingress_controller) as compose_parser:
            compose_parser.deploy()
            sys.exit(0)
    except Exception as deployment_exc:
        import traceback
        traceback.print_exc()
        logging.error('Error occurred during deployment: \n%s', deployment_exc)
        sys.exit(1)
