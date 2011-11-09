#!/bin/bash

for testdir in test-*; 
do
	cd $testdir; sh ./test.sh; cd ..;
done
