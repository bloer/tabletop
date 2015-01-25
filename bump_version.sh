#!/bin/bash
print_usage(){
    echo "$0 <newversion>"
    exit 0
}

NEWVERSION="$1"
[ -n "$NEWVERSION" ] || print_usage

OLDVERSION=`cat VERSION`
#escape periods
OLDVERSION="${OLDVERSION//./\.}"

FILELIST="VERSION package.json server.js static/index.html static/tabletopclient.js"
for file in $FILELIST ; do
    sed "s/$OLDVERSION/$NEWVERSION/g" $file >${file}.tmp
    mv ${file}.tmp $file
done
