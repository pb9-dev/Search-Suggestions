#!/bin/bash
set -e  # Exit if any command fails

echo "Updating packages..."
sudo apt update -y && sudo apt upgrade -y

echo "Installing .NET 9..."
wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt update -y
sudo apt install -y dotnet-sdk-9.0

echo "Installing Redis..."
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server