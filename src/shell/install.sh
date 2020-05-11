#!/bin/bash
###############################################################################
# Strict mode
###############################################################################
set -euo pipefail
IFS=$'\n\t'

###############################################################################
# CONSTANTS & UTILS
###############################################################################
# Check the status of the return value `retval=$?`
function check() {
  if [ $1 -eq 0 ]; then
    echo "[ OK ]"
  else
    echo "[ FAIL ]"
  fi
  echo
}

# Merge the $2 into $1
# If a key is already present in $1, it will be replaced by the value in $2
function config_files_fusion() {
  while IFS='=' read -r key value
  do
    if grep -q "^$key" $1; then
      sudo sed -i "s/$key.*/$key=$value/g" $1
    else
      echo "$key=$value" >> $1
    fi
  done < $2
}
###############################################################################
# MAIN
###############################################################################
echo
echo "Nginx"
echo " - Install"
sudo apt-get install -y nginx
check $?
echo " - Configuration"
cat > /etc/nginx/sites-available/default << EOF
server {
  listen 80;
  root /var/www/html;
  server_name  _;
  location /install.log {
      try_files \$uri \$uri/ /index.html;
  }
  location / {
    proxy_pass http://localhost:81/;
  }
}
EOF
check $?
echo " - Start"
sudo systemctl restart nginx
check $?

echo
echo "Server packages"
sudo apt-get install -y \
    git \
    apt-transport-https \
    ca-certificates \
    gnupg-agent \
    software-properties-common
check $?

echo
echo "Docker"
echo "  - Adding docker repository"
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo apt-key add -
sudo add-apt-repository  "deb [arch=amd64] https://download.docker.com/linux/debian  $(lsb_release -cs)  stable"
check $?
echo "  - Install"
sudo apt-get update
sudo apt-get -y install docker-ce docker-ce-cli containerd.io
check $?
echo "  - Start "
sudo systemctl enable docker
sudo systemctl restart docker
check $?

echo
echo "Docker Compose"
echo "  - Users permissions"
sudo usermod -G docker debian
sudo usermod -G docker root
check $?
echo "  - Install"
sudo curl -L "https://github.com/docker/compose/releases/download/1.25.5/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
check $?
sudo chmod +x /usr/local/bin/docker-compose

echo
echo "Hyphe"
echo " - Clone git repository"
sudo git clone https://github.com/medialab/hyphe.git /opt/hyphe
check $?
echo " - Go in `/opt/hyphe` directory"
cd /opt/hyphe
check $?
echo " - Global Configuration : restart policy"
sudo cp .env.example .env
sudo sed -i 's/RESTART_POLICY=no/RESTART_POLICY=unless-stopped/g' .env
check $?
echo " - Global Configuration : http port"
sudo sed -i 's/PUBLIC_PORT=80/PUBLIC_PORT=81/g' .env
check $?

echo " - Backend Configuration"
sudo cp config-backend.env.example config-backend.env
config_files_fusion ./config-backend.env /hyphe.env
check $?
echo " - Frontend Configuration"
sudo cp config-frontend.env.example config-frontend.env
config_files_fusion ./config-frontend.env /hyphe.env
check $?
rm /hyphe.env
echo " - File system permissions"
sudo chown -R debian:debian /opt/hyphe
check $?
echo " - Docker compose pull"
sudo /usr/local/bin/docker-compose pull
check $?
echo " - Docker compose up"
sudo  /usr/local/bin/docker-compose up -d
check $?
