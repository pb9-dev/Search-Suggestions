#!/bin/bash
set -e

echo "Updating packages..."
sudo apt update -y
sudo apt install wget -y

echo "Downloading CodeDeploy installer..."
AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
cd /tmp
until sudo wget "https://aws-codedeploy-$AWS_REGION.s3.$AWS_REGION.amazonaws.com/latest/install" -O codedeploy-install.sh; do
    echo "Retrying download..."
    sleep 5
done

chmod +x codedeploy-install.sh
sudo ./codedeploy-install.sh auto
sudo systemctl enable codedeploy-agent
sudo systemctl start codedeploy-agent



wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt update -y
sudo apt install -y dotnet-sdk-9.0

sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server


wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list)"
sudo apt update -y
sudo apt install -y mssql-server


sudo MSSQL_SA_PASSWORD='abc' MSSQL_PID='Express' /opt/mssql/bin/mssql-conf setup accept-eula


curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list)"
sudo apt update
sudo apt install -y mssql-tools unixodbc-dev

echo 'export PATH="$PATH:/opt/mssql-tools/bin"' >> ~/.bashrc
source ~/.bashrc

echo "Waiting for SQL Server to start..."
sleep 30  # Wait to ensure SQL Server is running

echo "Executing SQL script..."
/opt/mssql-tools/bin/sqlcmd -S localhost -U SA -P 'abc' -d master -i /var/www/backend/scripts/script.sql

echo "Completed."
