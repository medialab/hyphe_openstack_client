#!/bin/bash

###############################################################################
# Strict mode
###############################################################################
set -eo pipefail
IFS=$'\n\t'

###############################################################################
# CONSTANTS & UTILS
###############################################################################
mkdir -p /var/www/html
LOG_FILE="/var/www/html/install.log"

echo "Starting script at $(date)" > $LOG_FILE 2>&1

echo
echo "Installing curl" >> $LOG_FILE 2>&1
sudo apt-get update >> $LOG_FILE 2>&1
sudo apt-get install -y curl

echo
echo "Download install script" >> $LOG_FILE 2>&1
curl -s https://raw.githubusercontent.com/medialab/hyphe_openstack_client/master/src/shell/install.sh > install.sh
chmod +x install.sh

# SETTING HERE THE ENV VARIABLES FOR HYPHE
touch /hyphe.env
# @@_HYPHE_CONFIG_@@

echo
echo "Loading env" >> $LOG_FILE 2>&1
source /hyphe.env
# see https://docs.docker.com/compose/reference/envvars/#compose_file
sudo echo "#!/bin/sh" > /etc/profile.d/hyphe.sh
sudo echo "export COMPOSE_FILE=$COMPOSE_FILE" >> /etc/profile.d/hyphe.sh
chmod +x /etc/profile.d/hyphe.sh

echo
echo "Executing install script" >> $LOG_FILE 2>&1
./install.sh >> $LOG_FILE 2>&1
if [ $? -eq 0 ]; then
  echo "Installation completed at $(date)" >> $LOG_FILE 2>&1
else
  echo "/!\ Installation failed" >> $LOG_FILE 2>&1
fi
