# amsterdecks-vectorfield-generator
generates vector fields

##installation##
`cp config.json.example config.json`
change paths to data sources

##node-canvas requires cairo:
http://cairographics.org/download/
I installed it with brew:
`brew install cairo`
but it wouldn't work. It said cairo wasn't installed when trying `npm install canvas`
so I found a shell script on stack overflow for installing cairo, ran that.
but it failed installing cairo. Randomly tried `npm install canvas` again, this time it did work!
so I did `brew install cairo` again in order to have the brew version back,
then when requiring canvas in node it started whining about needing version 18 of freetype,
so I did
`brew unlink --overwrite freetype` and then
`brew link --overwrite freetype`
then it just worked.

#make sure that all data files coordinates are in WGS84!