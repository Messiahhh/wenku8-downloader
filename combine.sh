if ! command -v ebook-convert &>/dev/null ;then
    echo "Please install calibre to use this script"
    exit 1
fi
cd novels
rm -rf "out/"
mkdir "out"
rm -rf "tmp/"
mkdir "tmp"
for novel in */; do
    novel_name=$(echo $novel | sed 's/\/$//')
    out="tmp/$novel_name.md"
    echo Building $novel to "$out"
    section=1
    sectionc=0
    echo "# $novel_name" >> "$out"
    c=1
    while [ -f "$novel/$c.md" ] ; do
        chapter="$novel/$c.md"
        if [ $sectionc -eq 0 ]; then
            echo "" >> "$out"
            echo "## 第$section卷" >> "$out"
            sectionc=1
            section=$[section+1]
        fi
        title=$(head -n 1 "${chapter}"|sed 's/^# //')
        echo "" >> "$out"
        echo "### $title" >> "$out"
        tail -n +2 "$chapter" >> "$out"
        if [ "$title" == "插图" ];then
            sectionc=0
        fi
        c=$[c+1]
    done
    for pic in "$novel"/*.jpg ;do
        cp "$pic" "tmp/"
    done
    ebook-convert "$out" "out/$novel_name.epub" \
    --output-profile tablet\
    --level1-toc //h:h2\
    --level2-toc //h:h3\
    --max-toc-links 0 \
    --formatting-type markdown \
    --title "$novel_name"
done
echo "done"