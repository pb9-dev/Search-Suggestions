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

# Install Microsoft SQL Server
echo "Installing MSSQL Server..."
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list)"
sudo apt update -y
sudo apt install -y mssql-server

# Configure MSSQL
echo "Configuring MSSQL Server..."
sudo MSSQL_SA_PASSWORD='Abc@1234' MSSQL_PID='Express' /opt/mssql/bin/mssql-conf setup accept-eula
sudo systemctl enable mssql-server
sudo systemctl restart mssql-server
sleep 30  # Ensure SQL Server has time to start

# Install MSSQL Tools
echo "Installing MSSQL Tools..."
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list)"
sudo apt update
sudo apt install -y mssql-tools unixodbc-dev
echo 'export PATH="$PATH:/opt/mssql-tools/bin"' >> ~/.bashrc
source ~/.bashrc

# Verify SQL Server is Running
if systemctl is-active --quiet mssql-server; then
    echo "SQL Server is running."
else
    echo "Error: SQL Server failed to start." >&2
    exit 1
fi

# Run SQL Script
SQL_SCRIPT="/var/www/backend/scripts/script.sql"
if [ -f "$SQL_SCRIPT" ]; then
    echo "Executing SQL script..."
    /opt/mssql-tools/bin/sqlcmd -S localhost -U SA -P 'Abc@1234' -d master -i "$SQL_SCRIPT"
else
    echo "Warning: SQL script not found at $SQL_SCRIPT. Skipping execution."
fi

echo "Setup completed successfully!"
