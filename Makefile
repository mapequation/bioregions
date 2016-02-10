
SNAKE_DATA = data/coordinates_snakes_south_america.txt
PLANT_DATA = data/coordinates_plants_west_africa.txt

SEMANTIC_CSS = semantic/dist/semantic.min.css

.PHONY: all maps example_data

all: Infomap-worker.js example_data maps $(SEMANTIC_CSS) Makefile

build:
	npm run build

deploy-mapequation: build
	rsync -hav static ../

Infomap-worker.js:
	curl -LO http://www.mapequation.org/downloads/$@

example_data: data/mammals.txt
	@echo "Example data up-to-date!"

data/%:
	@echo "Downloading data: $@"
	@mkdir -p $(dir $@)
	curl http://www.mapequation.org/downloads/$(notdir $@) -o $@.download
	mv $@.download $@

maps:
	$(MAKE) -C maps

$(SEMANTIC_CSS):
	cd semantic && gulp build

clean:
	$(RM) Infomap-worker.js
	$(RM) -r data
	$(MAKE) -C maps clean
