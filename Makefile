
SNAKE_DATA = data/coordinates_snakes_south_america.txt
PLANT_DATA = data/coordinates_plants_west_africa.txt

.PHONY: all maps

all: Infomap-worker.js $(SNAKE_DATA) $(PLANT_DATA) Makefile

Infomap-worker.js:
	curl -LO http://www.mapequation.org/downloads/$@

$(SNAKE_DATA):
	@mkdir -p $(dir $@)
	curl http://www.mapequation.org/downloads/$(notdir $@) -o $@.download
	mv $@.download $@

$(PLANT_DATA):
	@mkdir -p $(dir $@)
	curl http://www.mapequation.org/downloads/$(notdir $@) -o $@.download
	mv $@.download $@

maps:
	$(MAKE) -C maps


clean:
	$(RM) Infomap-worker.js
	$(RM) -r data
	$(MAKE) -C maps clean
