#!/bin/bash
# One-shot: re-map any rows we wrongly inserted under emp_code='2' (Santosh)
# that actually came from device sn=AYSF05069981 where enrollid 2 = Ram.
PWORD='11kR0Y[4PwbQ'
SQL="UPDATE iclock_transaction SET emp_code='1', emp_id=(SELECT id FROM personnel_employee WHERE emp_code='1') WHERE terminal_sn='AYSF05069981' AND emp_code='2'; SELECT terminal_sn, emp_code, COUNT(*) FROM iclock_transaction WHERE terminal_sn='AYSF05069981' GROUP BY 1,2 ORDER BY 2;"
echo "$PWORD" | sudo -S -p '' docker exec postgres psql -U my_super_user -d easytime -c "$SQL"
