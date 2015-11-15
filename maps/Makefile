
# Available scale: 10m, 50m, 110m
SCALE = 110m

NE_URL = http://www.naturalearthdata.com/http//www.naturalearthdata.com/download/$(SCALE)/

# Cultural

## Admin 0 – Countries
### There are 247 countries in the world.
COUNTRIES = cultural/ne_$(SCALE)_admin_0_countries

## Urban Areas
### Area of dense human habitation.
URBAN_AREAS = cultural/ne_$(SCALE)_urban_areas

# Physical

## Coastline
### Includes major islands.
COASTLINE = physical/ne_$(SCALE)_coastline

## Land
### Land polygons including major islands.
LAND = physical/ne_$(SCALE)_land

## Ocean
### Ocean polygon split into contiguous pieces.
OCEAN = physical/ne_$(SCALE)_ocean

## Rivers, Lake Centerlines
### Single-line drainages including optional lake centerlines.
RIVERS_LAKE_CENTERLINES = physical/ne_$(SCALE)_rivers_lake_centerlines
RIVERS_LAKE_CENTERLINES_SCALE_RANK = physical/ne_$(SCALE)_rivers_lake_centerlines

## Lakes + Reservoirs
### Natural and artificial lakes.
LAKES = physical/ne_$(SCALE)_lakes

## Physical Labels
### Area and point labels of major physical features.
LABEL_AREAS = physical/ne_$(SCALE)_geography_regions_polys
LABEL_POINTS = physical/ne_$(SCALE)_geography_regions_points
ELEVATION_POINTS = physical/ne_$(SCALE)_geography_regions_elevation_points
MARINE_AREAS = physical/ne_$(SCALE)_geography_marine_polys

## Playas
### Salt pans and intermittent lakes.
PLAYAS = physical/ne_$(SCALE)_playas

## Geographic Lines
### Tropical and polar circles, equator, and International Date Line.
GEOGRAPHICAL_LINES = physical/ne_$(SCALE)_geographic_lines

.PHONY: clean

# topojson maps input filename to geometry objects, example:
# topojson -o land.topojson -- physical/ne_110m_land.json
# maps to {... , objects: {ne_110m_land: Object}, ...}

physical/land.topojson: $(LAND).shp Makefile
	cp $(LAND).shp physical/land.shp
	cp $(LAND).dbf physical/land.dbf
	cp $(LAND).prj physical/land.prj
	cp $(LAND).shx physical/land.shx
	topojson -o $@ -- physical/land.shp

# physical/land.topojson: physical/land.json Makefile
# 	topojson -o $@ -- $<

# physical/land.json: $(LAND).shp
# 	$(RM) $@
# 	ogr2ogr -f GeoJSON $@ $<

%.shp: %.zip
	@echo "%.shp: %.zip -> $@"
	unzip $< -d $(dir $@)
	touch $@

%.zip:
	@echo "%.zip -> $@"
	@mkdir -p $(dir $@)
	curl -LO $(NE_URL)$@
	mv $(notdir $@) $@

clean:
	$(RM) -r physical cultural
