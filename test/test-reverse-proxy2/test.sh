#!/bin/sh

# fire up a master and 2 slaves, send data to both slaves and ensure they both
# get their stats outputted
> test.actual.output
nc -lk 2003 >> test.actual.output &
NC_PID=$!
node ../../stats.js master.config &
MASTER_PID=$!
node ../../stats.js slave1.config &
SLAVE_PID1=$!
node ../../stats.js slave2.config &
SLAVE_PID2=$!
sleep 1
echo Sending metric to slave 1
echo 'test-proxy1.slave1-msg:1|c' | nc -u4 -w1 localhost 8701
echo Metric sent
echo Sending metric to slave 2
echo 'test-proxy1.slave2-msg:1|c' | nc -u4 -w1 localhost 8701
echo Metric sent
sleep 1
awk -F' ' '{ print $1,$2 }' test.actual.output > test.output
diff test.output test.expected.output
kill -9 $NC_PID
kill -9 $MASTER_PID
kill -9 $SLAVE_PID1
kill -9 $SLAVE_PID2
