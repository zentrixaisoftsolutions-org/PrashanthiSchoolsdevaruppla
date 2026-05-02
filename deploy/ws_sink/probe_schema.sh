#!/bin/bash
SQL="\d iclock_terminal"
echo '11kR0Y[4PwbQ' | sudo -S -p '' docker exec postgres psql -U my_super_user -d easytime -c "$SQL"
echo '---SMS layout---'
ls /home/ktsbnd/SMS/
echo '---attendance_devices schema---'
echo '11kR0Y[4PwbQ' | sudo -S -p '' /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'DareDevil@071520' -d SchoolERP -Q "SELECT TOP 1 name FROM sys.tables WHERE name='attendance_devices'" -h-1 2>/dev/null || echo "sqlcmd N/A or password unknown"
