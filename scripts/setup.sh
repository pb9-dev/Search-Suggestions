#!/bin/bash
set -e  # Exit if any command fails

LOG_FILE="/var/log/setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1  # Log all output

echo "Starting setup..."

echo "Updating packages..."
sudo apt update -y
sudo apt install -y wget unzip curl gnupg2 software-properties-common

# Install .NET SDK 9.0
echo "Installing .NET SDK 9.0..."
wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt update -y
sudo apt install -y dotnet-sdk-9.0
dotnet --version || { echo "Error: .NET installation failed"; exit 1; }

# Install Redis
echo "Installing Redis..."
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl restart redis-server
if systemctl is-active --quiet redis-server; then
    echo "Redis is running."
else
    echo "Error: Redis failed to start." >&2
    exit 1
fi

echo "Installing SQL Server tools..."
sudo wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/22.04/prod.list)"
sudo apt update -y
sudo apt install -y mssql-tools unixodbc-dev

# Add sqlcmd to PATH
echo 'export PATH="$PATH:/opt/mssql-tools/bin"' >> ~/.bashrc
source ~/.bashrc

# Move migrate.sql to the correct directory
echo "Moving migrate.sql to /var/www/backend/scripts/"
mkdir -p /var/www/backend/scripts
mv /var/www/backend/migrate.sql /var/www/backend/scripts/migrate.sql

# Execute the migration script on RDS
echo "Running SQL migration on Amazon RDS..."
/opt/mssql-tools/bin/sqlcmd -S searchengine-db.ap-south-1.rds.amazonaws.com -U admin -P 'admin1234' -i /var/www/backend/scripts/migrate.sql
