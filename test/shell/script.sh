#!/bin/bash

###############################################################################
# Strict mode
###############################################################################
set -uo pipefail
IFS=$'\n\t'

###############################################################################
# CONSTANTS & UTILS
###############################################################################
mkdir -p /var/www/html
LOG_FILE="/var/www/html/install.log"

echo "Starting script at $(date)" > $LOG_FILE

echo
echo "Installing curl" >> $LOG_FILE
sudo apt-get update >> $LOG_FILE
sudo apt-get install -y curl

echo
echo "Download install script" >> $LOG_FILE
curl https://raw.githubusercontent.com/medialab/hyphe_openstack_client/master/test/shell/install.sh > install.sh
chmod +x install.sh

# SETTING HERE THE ENV VARIABLES FOR HYPHE
# Example :
echo "export PUBLIC_PORT=81" > hyphe.env

echo
echo "Executing install script" >> $LOG_FILE
./install.sh >> $LOG_FILE
if [ $? -eq 0 ]; then
  echo "Installation completed at $(date)" >> $LOG_FILE
else
  echo "/!\ Installation failed" >> $LOG_FILE
fi
