SEMANTIC_CSS = semantic/dist/semantic.min.css

.PHONY: all npm build update-remote update-test-remot maps

all: npm Infomap-worker.js maps $(SEMANTIC_CSS) Makefile

npm:
	npm install

build:
	npm run build

update-remote:
	rsync -hav index.html index.css static mapequation:/var/www/bioregions/

update-test-remote:
	rsync -hav index.html index.css static mapequation:/var/www/test.bioregions/

Infomap-worker.js:
	curl -LO http://www.mapequation.org/downloads/$@

maps:
	$(MAKE) -C maps

$(SEMANTIC_CSS):
	cd semantic && gulp build

clean:
	$(RM) Infomap-worker.js
	$(RM) -r data
	$(MAKE) -C maps clean
