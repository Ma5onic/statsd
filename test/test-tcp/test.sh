#!/bin/sh

# test 1 - fire up statsd, send a UDP packet, ensure its received
> test1.actual.output
nc -lk 2003 >> test1.actual.output &
NC_PID=$!
node ../../stats.js test1.config &
NODE_PID=$!
sleep 1
echo Sending metric
echo 'test1.msg1:1|c\ntest1.msg2:2|c' | nc -w1 localhost 8125
echo Metric sent
sleep 1
echo KILLING $PID
awk -F' ' '{ print $1,$2 }' test1.actual.output > test1.output
diff test1.output test1.expected.output
kill -9 $NC_PID
kill -9 $NODE_PID
