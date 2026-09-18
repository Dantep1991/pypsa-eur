# Nohm Atlas data-source register

> Status: **HOLD for commercial production**. This generated engineering inventory
> records declared source terms; it is not legal approval. Every source still needs
> an accountable owner, required attribution and destination-release sign-off.

Schema: `nohm.atlas.source-governance.v1`
Generated: `2026-09-07T10:55:07+00:00`
Sources: **28**; open terms declared: **10**; review/permission/missing: **18**.

| Dataset | Source | Publisher | Version | Declared terms | Engineering status |
| --- | --- | --- | --- | --- | --- |
| basemap | [Esri World Dark Gray basemap and reference labels](https://www.esri.com/en-us/legal/terms/full-master-agreement) | Esri and credited data contributors | live tile service | Esri service terms and source-specific contributor attribution | terms_review_required |
| electricity | [PyPSA-Eur cached country networks](https://pypsa-eur.readthedocs.io/en/latest/data-sources/) | PyPSA-Eur contributors and upstream data publishers | v2026.02.0: 34 files | Composite: PyPSA-Eur data files CC BY 4.0; upstream inputs retain source-specific terms | terms_review_required |
| grid_access | [ECP-GSS current final TSO application batch](https://www.eirgrid.ie/industry/becoming-customer/generator-connections) | EirGrid | — | Publisher terms | terms_review_required |
| grid_access | [ECP-GSS current initial TSO application batch](https://www.eirgrid.ie/industry/becoming-customer/generator-connections) | EirGrid | — | Publisher terms | terms_review_required |
| grid_access | [GSP, Gnode and Direct Connect coordinate lookup](https://www.neso.energy/data-portal/gis-boundaries-gb-grid-supply-points) | National Energy System Operator | — | NESO Open Data Licence | declared_open_terms |
| grid_access | [Transmission Entry Capacity Register](https://www.neso.energy/data-portal/transmission-entry-capacity-tec-register/tec_register) | National Energy System Operator | — | NESO Open Data Licence | declared_open_terms |
| grid_access | [PyPSA-Eur transmission-substation location crosswalk](https://www.openstreetmap.org/copyright) | PyPSA-Eur and OpenStreetMap contributors | — | ODbL 1.0 | declared_open_terms |
| grid_access | [Admissible demand access applications](https://www.ree.es/es/clientes/consumidor/acceso-conexion/conoce-el-estado-de-las-solicitudes) | Red Electrica de Espana | — | Publisher terms | terms_review_required |
| grid_access | [Demand access capacity at transmission nodes](https://www.ree.es/es/clientes/consumidor/acceso-conexion/conoce-la-capacidad-de-acceso) | Red Electrica de Espana | — | Publisher terms | terms_review_required |
| grid_access | [Generation access capacity at transmission nodes](https://www.ree.es/es/clientes/generador/acceso-conexion/conoce-la-capacidad-de-acceso) | Red Electrica de Espana | — | Publisher terms | terms_review_required |
| grid_access | [Demand mutualisation zones and connection capacity](https://www.services-rte.com/fr/decouvrez-nos-offres-de-service/consulter-la-localisation-des-zones-de-mutualisation-et-les-capacites-daccueil-pour-la-consommation.html) | Reseau de Transport d'Electricite | — | Publisher terms | terms_review_required |
| land | [CORINE Land Cover 2006](https://land.copernicus.eu/en/products/corine-land-cover/clc-2006) | Copernicus Land Monitoring Service / EEA | CLC 2006 v18.5 local PyPSA archive | Copernicus full, free and open data policy; source citation required | declared_open_terms |
| land | [Natura 2000 protected sites](https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4) | European Environment Agency / European Commission | 2025-08-15 local PyPSA raster | EEA legal notice and dataset metadata; attribution and source-specific rights apply | terms_review_required |
| liquids | [Industrial Reporting under IED/E-PRTR v16](https://industry.eea.europa.eu/industrial-emissions/dataset) | European Environment Agency | 2007-2024; published February 2026 | EEA standard reuse policy | terms_review_required |
| liquids | [OpenStreetMap planet data via QLever](https://qlever.dev/osm-planet) | OpenStreetMap contributors | live query cache | ODbL 1.0 | declared_open_terms |
| logistics | [Nohm Atlas LNG terminals](https://www.entsog.eu/) | ENTSOG/GIE/open infrastructure sources | local Atlas cache | Source-specific | terms_review_required |
| logistics | [Nohm Atlas mapped liquid tanks](https://www.openstreetmap.org/copyright) | OpenStreetMap contributors via QLever | local Atlas cache | ODbL 1.0 | declared_open_terms |
| logistics | [Freight and mail transport by main airport](https://ec.europa.eu/eurostat/databrowser/view/avia_gooa/default/table) | Eurostat | 2024 | Eurostat reuse policy | terms_review_required |
| logistics | [Airport infrastructure by reporting airport](https://ec.europa.eu/eurostat/databrowser/view/avia_if_typ/default/table) | Eurostat | 2024 | Eurostat reuse policy | terms_review_required |
| logistics | [Gross weight handled in main ports by cargo and direction](https://ec.europa.eu/eurostat/databrowser/view/mar_go_qmc/default/table) | Eurostat | 2024 | Eurostat reuse policy | terms_review_required |
| logistics | [GISCO Airports 2024](https://ec.europa.eu/eurostat/en/web/gisco/geodata/transport-networks) | Eurostat GISCO | 2024 (published 2026-06-08) | Eurostat/GISCO reuse conditions | terms_review_required |
| logistics | [World Port Index](https://msi.nga.mil/Publications/WPI) | US National Geospatial-Intelligence Agency | live World Port Index Viewer | US Government public data | terms_review_required |
| methane | [Summer Supply Outlook 2026 Annexes A and B](https://www.entsog.eu/outlooks-reviews) | ENTSOG | 2026 | Indicative MVP use; verify permission before commercial distribution | permission_required |
| methane | [System Capacity Map 2026 – Capacity dataset](https://www.entsog.eu/maps) | ENTSOG / GIE | 2026 | Indicative MVP use; verify permission before commercial distribution | permission_required |
| methane | [SciGRID_gas IGGIELGN](https://zenodo.org/records/4767098) | DLR Institute of Networked Energy Systems | 1.1.2 | CC BY 4.0 | declared_open_terms |
| water | [Urban Waste Water Treatment Directive reported data](https://water.discomap.eea.europa.eu/arcgis/rest/services/WISE_UWWTD) | European Environment Agency | 2022 reporting dataset (published 2026) | CC BY 4.0 | declared_open_terms |
| water | [Water Framework Directive surface water bodies](https://water.discomap.eea.europa.eu/arcgis/rest/services/WISE_WFD) | European Environment Agency | WFD 2022 | CC BY 4.0 | declared_open_terms |
| water | [OpenStreetMap water infrastructure](https://qlever.dev/osm) | OpenStreetMap contributors | live planet snapshot | ODbL 1.0 | declared_open_terms |

## Promotion rule

`declared_open_terms` means only that a named/open reuse statement is recorded; it
does not mean the Atlas product complies with attribution, share-alike, database-right,
third-party or trademark obligations. Sources marked `terms_review_required`,
`permission_required` or `terms_missing` keep the production data gate on HOLD.
The immutable release must link this register plus the legal/data-owner decision in
`PRODUCTION_ACCEPTANCE.md`.
