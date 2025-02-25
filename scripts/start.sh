#!/bin/bash
sudo systemctl stop backend.service || true
sudo cp -r /var/www/backend /var/www/backend_prev
cd /var/www/backend
sudo chmod +x SearchApi.dll
nohup dotnet SearchApi.dll --urls http://0.0.0.0:5000 > /dev/null 2>&1 &