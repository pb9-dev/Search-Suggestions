#!/bin/bash
set -e  # Exit if any command fails

echo "Updating packages..."
sudo apt update -y && sudo apt upgrade -y

echo "Installing AWS CodeDeploy Agent..."
sudo apt install ruby-full -y
wget https://aws-codedeploy-ap-south-1.s3.ap-south-1.amazonaws.com/latest/install -O codedeploy-install.sh
chmod +x codedeploy-install.sh
sudo ./codedeploy-install.sh auto
sudo systemctl enable codedeploy-agent
sudo systemctl start codedeploy-agent

echo "Installing .NET 9.."
wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt update -y
sudo apt install -y dotnet-sdk-9.0

echo "Installing Redis.."
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

echo "Installing SQL Server..."
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list)"
sudo apt update -y
sudo apt install -y mssql-server

echo "Configuring SQL Server.."
sudo MSSQL_SA_PASSWORD='YourStrong!Passw0rd' MSSQL_PID='Express' /opt/mssql/bin/mssql-conf setup accept-eula

echo "Installing SQL Server tools..."
sudo apt install -y unixodbc-dev msodbcsql18 mssql-tools18
echo 'export PATH="$PATH:/opt/mssql-tools/bin"' >> ~/.bashrc
source ~/.bashrc

echo "Waiting for SQL Server to start..."
sleep 30  # Wait to ensure SQL Server is running

echo "Executing SQL script..."
/opt/mssql-tools/bin/sqlcmd -S localhost -U SA -P 'YourStrong!Passw0rd' -d master -i /var/www/backend/scripts/script.sql

echo "Completed."
