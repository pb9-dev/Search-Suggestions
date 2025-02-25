#!/bin/bash
set -e  # Exit if any command fails

echo "Starting the backend service..."

# Navigate to deployment directory
cd /var/www/backend/out

# Run the app in the background and redirect logs
nohup dotnet SearchApi.dll --urls "http://0.0.0.0:5000" > log.txt 2>&1 &
echo "Backend is running!"
