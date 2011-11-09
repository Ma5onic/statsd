#!/bin/sh

# fire up a master and slave, send data to the slave and ensure it arrives
# on the master
> test.actual.output
nc -lk 2003 >> test.actual.output &
NC_PID=$!
node ../../stats.js master.config &
MASTER_PID=$!
node ../../stats.js slave.config &
SLAVE_PID=$!
sleep 1
echo Sending metric to slave
echo 'test-proxy1.slave-msg:1|c' | nc -u4 -w1 localhost 8701
echo Metric sent
echo Sending metric to master
echo 'test-proxy1.master-msg:1|c' | nc -u4 -w1 localhost 8701
echo Metric sent
sleep 1
awk -F' ' '{ print $1,$2 }' test.actual.output > test.output
diff test.output test.expected.output
kill -9 $NC_PID
kill -9 $MASTER_PID
kill -9 $SLAVE_PID
