angular.module('palladioGraphComponent', ['palladio.services', 'palladio'])
	.run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			// Options
			// 		showSettings: true
			//		showMetrics: false
			// 		height: 300px

			newScope.showSettings = newScope.showSettings === undefined ? true : newScope.showSettings;
			newScope.showMetrics = newScope.showMetrics === undefined ? false : newScope.showMetrics;
			newScope.graphHeight = newScope.height === undefined ? "100%" : newScope.height;
			newScope.functions = {};

			var compileString = '<div class="with-settings" data-palladio-graph-view-with-settings ';
			compileString += 'show-settings=showSettings ';
			compileString += 'show-settings=showMetrics ';
			compileString += 'graph-height=graphHeight ';
			compileString += 'functions=functions ';
			compileString += 'unimodal=unimodal ';
			compileString += '></div>';

			return compileString;
		};

		componentService.register('graph', compileStringFunction);
	}])
	.directive('palladioGraphView', ['palladioService', function (palladioService) {

		return {

			scope : {
				linkDimension: '=',
				graphHeight: '=',
				showLinks: '=',
				showLabels: '=',
				nodeSize: '=',
				// circleLayout: '=',
				highlightSource: '=',
				highlightTarget: '=',
				countBy : '@',
				countDescription: '@',
				aggregationType: '@',
				aggregateKey: '@',
				readInternalState: '=',
				setInternalState: '=',
				getSvg: '=',
				metrics: '=',
				unimodal: '='
			},

			link: function (scope, element, attrs) {

				var deregister = [];
				var uniqueId = "graphView" + Math.floor(Math.random() * 10000);

				scope.readInternalState = function (state) {
					// Placeholder
					state.fixedNodes = chart.fixedNodes();
					return state;
				};

				scope.setInternalState = function (state) {
					chart.fixedNodes(state.fixedNodes);
					return state;
				};

				scope.getSvg = function () {
					return chart.getSvg();
				};

				scope.sortType = "name";
				scope.sortReverse = false;
				scope.searchNodes = "";

				var search = "";

				var width = element.width() || 1000,
					height = scope.graphHeight && scope.graphHeight.indexOf("%") === -1 ? scope.graphHeight.slice(0, scope.graphHeight.length-2) : element.height() || 800;

				var canvas = d3.select(element[0])
					.append('canvas')
						.attr('style', 'position: absolute; left: 0; top: 0; z-index: -100');

				var svg = d3.select(element[0])
					.append('svg:svg');
					// .attr("pointer-events", "all");

				var chart = d3.graph();

				var linkGroup = null;

				function update() {

					if (!scope.linkDimension) return;

					chart
						.width(width)
						.height(height)
						.showLinks(scope.showLinks)
						.showLabels(scope.showLabels)
						.nodeSize(scope.nodeSize)
						.searchText(search)
						.circle(scope.circleLayout);

					canvas
						.attr('width', width)
      					.attr('height', height);

					svg
						.attr('width', width)
						.attr('height', height)
						.datum(links())
						.call(chart);

					var allLinks = links().map(function(l) { return [l.data.source,l.data.target]; });
					scope.metrics = metrics(allLinks);

					if(scope.highlightSource) chart.highlightSource();
					if(scope.highlightTarget) chart.highlightTarget();

				}

				function metrics(allLinks) {
					var G = new jsnx.Graph();
					G.addEdgesFrom(allLinks);

					var betweenness = jsnx.betweennessCentrality(G)._stringValues;
	        var degree = G.degree()._stringValues;

	        var density = jsnx.density(G);
          var averageClustering = jsnx.averageClustering(G);
          var clustering = jsnx.clustering(G)._stringValues;
	        var transitivity = jsnx.transitivity(G);
					var nodecount = G.nodes().length;
					var edgecount = G.edges().length;
					var averageDegree = Object.values(G.degree()._stringValues).reduce(function(a,b) { return a + b; }, 0) / nodecount

		      try {
		        var eigenvector = jsnx.eigenvectorCentrality(G)._stringValues;
		      } catch(err) {
		        console.error(err);
		      }

					var allNodeMetrics = [];
					G.nodes().forEach(function(n) {
						var nodeMetrics = {};
						nodeMetrics["name"] = n;
						nodeMetrics["degree"] = degree[n];
						nodeMetrics["betweenness"] = betweenness[n].toFixed(10);
						if (eigenvector) {
							nodeMetrics["eigenvector"] = eigenvector[n].toFixed(10);
						}
						nodeMetrics["clustering"] = clustering[n].toFixed(10);
						allNodeMetrics.push(nodeMetrics);
					})

					var globalMetrics = {
						"density": density.toFixed(8),
						"averageClustering": averageClustering.toFixed(8),
						"transitivity": transitivity.toFixed(8),
						"nodecount": nodecount,
						"edgecount": edgecount,
						"averageDegree": averageDegree.toFixed(8),
						"nodes": allNodeMetrics
					};
					return globalMetrics;
				}

				function links() {

					if(!linkGroup) {

						var helpers = crossfilterHelpers.countByDimensionWithInitialCountAndData(
							function(v) { return v[scope.countBy]; },
							// This function sets up the 'data' attribute of each link
							function (d, p, t) {
								if(p === undefined) {
									p = {
										source: scope.linkDimension.accessor(d)[0],
										target: scope.linkDimension.accessor(d)[1],
										data: d,
										agg: 0,
										initialAgg: 0
									};
								}
								if(t === 'add') {
									// Adding a new record.
									if(scope.aggregationType === 'COUNT') {
										p.agg++;
									} else {
										p.agg = p.agg + (+d[scope.aggregateKey] ? +d[scope.aggregateKey] : 0); // Make sure to cast or you end up with a String!!!
									}
									if(p.agg > p.initialAgg) p.initialAgg = p.agg;
								} else {
									// Removing a record.
									if(scope.aggregationType === 'COUNT') {
										p.agg--;
									} else {
										p.agg = p.agg - (+d[scope.aggregateKey] ? +d[scope.aggregateKey] : 0); // Make sure to cast or you end up with a String!!!
									}
								}
								return p;
							}
						);

						linkGroup = scope.linkDimension.group().reduce(
							helpers.add,
							helpers.remove,
							helpers.init
						).order(function (a) { return a.data.agg; });
					}

					return linkGroup
						.top(Infinity)
						.map(function (d) { return d.value; })
						// If we want to show 0-count nodes, remove this line.
						// But we need to do something to indicate the 0-count state in d3.graph.js
						.filter(function (d) { return d.data.agg > 0; });
				}

				scope.$on('zoomIn', function(){
					chart.zoomIn();
				});

				scope.$on('zoomOut', function(){
					chart.zoomOut();
				});

				scope.$on('zoomToData', function() {
					chart.zoomToData();
				})

				// update on xfilters events
				deregister.push(palladioService.onUpdate(uniqueId, function() {
					// Only update if the table is visible.
					if(element.is(':visible')) { update(); }
				}));

				// Update when it becomes visible (updating when not visibile errors out)
				scope.$watch(function() { return element.is(':visible'); }, update);

				scope.$on('resetNodes', function() {
					chart.resetNodes();
				});
				scope.$watch('linkDimension', function() {
					chart.reset();
					if(linkGroup) {
						linkGroup.remove();
						linkGroup = null;
					}
					update();
				});

				scope.$watchGroup(['countBy', 'aggregationType',
					'aggregationKey'], function() {
					chart.reset();
					if(linkGroup) {
						linkGroup.remove();
						linkGroup = null;
					}
					update();
				});

				scope.$watch('showLinks', update);
				scope.$watch('showLabels', update);
				scope.$watch('nodeSize', update);
				deregister.push(palladioService.onSearch(uniqueId, function(text) { search = text; update(); }));
				scope.$watch('circleLayout', update);
				scope.$watch('highlightSource', function (nv, ov) {
					if(nv !== ov) {
						if(nv) {
							scope.highlightTarget = false;
							chart.highlightSource();
						} else {
							if(!scope.highlightTarget) chart.removeHighlight();
						}
					}
				});
				scope.$watch('highlightTarget', function (nv, ov) {
					if(nv !== ov) {
						if(nv) {
							scope.highlightSource = false;
							chart.highlightTarget();
						} else {
							if(!scope.highlightSource) chart.removeHighlight();
						}
					}
				});

				scope.$on("resize", function(){
					width = element.width();
					update();
				});

				function refresh() {
					element.height(scope.graphHeight ? scope.graphHeight.slice(0, scope.graphHeight.length-2) : $(window).height());
				}

				$(document).ready(refresh);
				$(window).resize(refresh);

			}

		};
	}])

	// Palladio Timechart View with Settings
	.directive('palladioGraphViewWithSettings', ['exportService', 'palladioService', 'dataService', function (exportService, palladioService, dataService) {

		return {
			scope: {
				showSettings: '=',
				showMetrics: '=',
				graphHeight: '=',
				functions: '=',
				unimodal: '='
			},

			templateUrl : 'partials/palladio-graph-component/template.html',

			link : {

				pre: function (scope, element, attrs) {

					if(scope.showSettings === undefined) {
						scope.settings = true;
					} else { scope.settings = scope.showSettings; }
					if(scope.showMetrics === undefined) {
						scope.displayMetrics = true;
					} else { scope.displayMetrics = scope.showMetrics; }

					var deregister = [];

					scope.metadata = dataService.getDataSync().metadata;
					scope.xfilter = dataService.getDataSync().xfilter;

					scope.uniqueToggleId = "graphView" + Math.floor(Math.random() * 10000);
					scope.uniqueModalId = scope.uniqueToggleId + "modal";

					scope.fields = scope.metadata.sort(function (a, b) { return a.description < b.description ? -1 : 1; });

					scope.dateFields = scope.metadata.filter(function (d) { return d.type === 'date'; });

					scope.mapping = {};

					scope.nodeSize = false;
					scope.showLabels = true;
					scope.circleLayout = false;

					scope.highlightSource = false;
					scope.highlightTarget = false;

					scope.showLinks = true;

					// Set up aggregation selection.
					scope.getAggDescription = function (field) {
						if(field.type === 'count') {
							return 'Number of ' + field.field.countDescription;
						} else {
							return 'Sum of ' + field.field.description + ' (from ' + countDims.get(field.fileId).countDescription + ' table)';
						}
					};

					var countDims = d3.map();
						scope.metadata.filter(function (d) { return d.countable === true; })
							.forEach(function (d) {
								countDims.set(d.originFileId ? d.originFileId : 0, d);
							});

					scope.aggDims = scope.metadata.filter(function (d) { return d.countable === true || d.type === 'number'; })
							.map(function (a) {
								return {
									key: a.key,
									type: a.countable ? 'count' : 'sum',
									field: a,
									fileId: a.originFileId ? a.originFileId : 0
								};
							})
							.filter(function(d) { return countDims.get(d.fileId) ? true : false; })
							.sort(function (a, b) { return scope.getAggDescription(a) < scope.getAggDescription(b) ? -1 : 1; });


					scope.aggDim = scope.aggDims[0];
					scope.$watch('aggDim', function () {
						// scope.countBy = scope.aggDim ? scope.countDim.key : scope.countBy;
						if(!scope.aggDim) {
							// No aggregation selected - just choose the first one
							scope.countBy = scope.countDims.get(0).key;
						} else {
							// We figure out the unique aggregation dimension based on aggDim
							if(scope.aggDim.type === 'count') {
								scope.countBy = scope.aggDim.key;
								scope.aggregationType = 'COUNT';
								scope.aggregateKey = null;
								scope.aggDescription = scope.getAggDescription(scope.aggDim);
							} else {
								// We are summing
								scope.countBy = countDims.get(scope.aggDim.fileId).key;
								scope.aggregationType = 'SUM';
								scope.aggregateKey = scope.aggDim.key;
								scope.aggDescription = scope.getAggDescription(scope.aggDim);
							}
						}
					});
					scope.showAggModal = function () { $('#' + scope.uniqueModalId).find('#agg-modal').modal('show'); };

					scope.$watch('mapping.sourceDimension', function(){
						updateLinkDimension();
					});

					scope.$watch('mapping.targetDimension', function(){
						updateLinkDimension();
					});

					function updateLinkDimension() {
						var sourceAccessor = !scope.mapping.sourceDimension ? null : function(d) { return d[scope.mapping.sourceDimension.key]; };
						var targetAccessor = !scope.mapping.targetDimension ? null : function(d) { return d[scope.mapping.targetDimension.key]; };
						if(scope.linkDimension) scope.linkDimension.remove();
						if(scope.mapping.sourceDimension && scope.mapping.targetDimension) {
							scope.linkDimension = scope.xfilter.dimension(function(d) { return [ sourceAccessor(d), targetAccessor(d) ]; });
							scope.linkDimension.accessor = function(d) { return [ sourceAccessor(d), targetAccessor(d) ]; };
						}
						var dataLinks = dataService.getLinks();
						var sourceKey = scope.mapping.sourceDimension.key;
						var targetKey = scope.mapping.targetDimension.key;
						var dataKeys = {}
						dataLinks.forEach(function(d) {
						 dataKeys[d.source.field.key] = d.lookup.field.key;
					 });
					 if (sourceKey in dataKeys && targetKey in dataKeys && dataKeys[sourceKey] === dataKeys[targetKey]) {
						scope.unimodal = true;
					 } else {
						scope.unimodal = false;
					 }
					}

					// Clean up after ourselves. Remove dimensions that we have created. If we
					// created watches on another scope, destroy those as well.
					scope.$on('$destroy', function () {
						if(scope.linkDimension) scope.linkDimension.remove();
						deregister.forEach(function (f) { f(); });
					});

					scope.resetNodes = function () {
						scope.$broadcast('resetNodes');
					};

					scope.showSourceModal = function(){
						$('#source-modal').modal('show');
					};

					scope.showTargetModal = function(){
						$('#target-modal').modal('show');
					};

					scope.clearDimensions = function () {
						scope.mapping.sourceDimension = null;
						scope.mapping.targetDimension = null;
					};

					scope.zoomIn = function(){
						scope.$broadcast('zoomIn');
					};

					scope.zoomOut = function(){
						scope.$broadcast('zoomOut');
					};

					scope.zoomToData = function() {
						scope.$broadcast('zoomToData');
					};

					// State save/load.

					scope.setInternalState = function (state) {
						// Placeholder
						return state;
					};

					// Add internal state to the state.
					scope.readInternalState = function (state) {
						// Placeholder
						return state;
					};

					scope.getSvg = function () {
						// Placeholder
						return {};
					}

					scope.exportSvg = function(source, title){
						exportService(scope.getSvg(), title);
					};

					function importState(state) {
						scope.showLinks = state.showLinks;
						scope.showLabels = state.showLabels;
						scope.nodeSize = state.nodeSize;
						scope.highlightSource = state.highlightSource;
						scope.highlightTarget = state.highlightTarget;
						scope.countDim = state.countDim;
						scope.mapping.sourceDimension = scope.fields.filter(function(f) { return f.key === state.sourceDimension; })[0];
						scope.mapping.targetDimension = scope.fields.filter(function(f) { return f.key === state.targetDimension; })[0];
						if(state.aggDimKey) scope.aggDim = scope.aggDims.filter(function(f) { return f.key === state.aggDimKey; })[0];

						scope.$digest();

						scope.setInternalState(state);
					}

					function exportState() {
						return scope.readInternalState({
							showLinks: scope.showLinks,
							showLabels: scope.showLabels,
							aggregateKey: scope.aggregateKey,
							aggregationType: scope.aggregationType,
							nodeSize: scope.nodeSize,
							highlightSource: scope.highlightSource,
							highlightTarget: scope.highlightTarget,
							countDim: scope.countDim,
							aggDimKey: scope.aggDim.key,
							sourceDimension: scope.mapping.sourceDimension ? scope.mapping.sourceDimension.key : null,
							targetDimension: scope.mapping.targetDimension ? scope.mapping.targetDimension.key : null
						});
					}

					deregister.push(palladioService.registerStateFunctions(scope.uniqueToggleId, 'graphView', exportState, importState));

					if(scope.functions) {
						scope.functions["source"] = function(dim) {
							scope.$apply(function(s) {
								s.mapping.sourceDimension = s.fields.filter(function(f) { return f.key === dim.key; })[0];
							});
						};
						scope.functions["target"] = function(dim) {
							scope.$apply(function(s) {
								s.mapping.targetDimension = s.fields.filter(function(f) { return f.key === dim.key; })[0];
							});
						};
						scope.functions["showLinks"] = function(bool) {
							scope.$apply(function(s) {
								s.showLinks = bool;
							});
						};
						scope.functions["showLabels"] = function(bool) {
							scope.$apply(function(s) {
								s.showLabels = bool;
							});
						};
						scope.functions["nodeSize"] = function(bool) {
							scope.$apply(function(s) {
								s.nodeSize = bool;
							});
						};
						scope.functions["zoomOut"] = function() {
							scope.$apply(function(s) { s.zoomOut(); });
						};
						scope.functions["zoomIn"] = function() {
							scope.$apply(function(s) { s.zoomIn(); });
						}
						scope.functions["zoomToData"] = function() {
							scope.$apply(function(s) { s.zoomToData(); });
						}
						scope.functions['getSettings'] = function() {
							return element.find('.graph-settings')[0]
						}
						scope.functions['importState'] = function(state) {
							importState(state)
							return true
						}
						scope.functions['exportState'] = function() {
							return exportState()
						}
					}
				},

				post: function(scope, element, attrs) {
					element.find('.settings-toggle').click(function() {
						element.find('.settings').toggleClass('closed');
					});

					element.find('.metrics-toggle').click(function() {
						element.find('.metrics').toggleClass('closed');
					});

					if(scope.graphHeight) {
						element.height(scope.graphHeight);
					}
				}
			}

		};
	}]);

angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-graph-component/template.html',
        "<div class=\"\">\n\n\t<div data-palladio-graph-view\n\t\tgraph-height=\"graphHeight\"\n\t\tstyle=\"margin-bottom: -55px\"\n\t\tlink-dimension=\"linkDimension\"\n\t\tshow-links=\"showLinks\"\n\t\tshow-labels=\"showLabels\"\n\t\thighlight-source=\"highlightSource\"\n\t\thighlight-target=\"highlightTarget\"\n\t\tread-internal-state=\"readInternalState\"\n\t\tset-internal-state=\"setInternalState\"\n\t\tget-svg=\"getSvg\"\n\t\tnode-size=\"nodeSize\"\n\t\tdata-aggregation-type=\"{{aggregationType}}\"\n\t\tdata-aggregate-key=\"{{aggregateKey}}\"\n\t\tcount-by=\"{{countBy}}\"\n\t\tcount-description=\"{{aggDescription}}\"\n\t\tmetrics=\"metrics\"\n\t\tunimodal=\"unimodal\">\n\n\t\t<div class=\"leaflet-top leaflet-left\">\n\t\t\t<div class=\"leaflet-control-zoom-graph leaflet-bar leaflet-control\">\n\t\t\t\t<a class=\"leaflet-control-zoom-in\" ng-click=\"zoomIn()\" title=\"Zoom in\">+</a>\n\t\t\t\t<a class=\"leaflet-control-zoom-out\" ng-click=\"zoomOut()\" title=\"Zoom out\">-</a>\n\t\t\t</div>\n\t\t\t<div class=\"zoom-to-data-control leaflet-bar leaflet-control\">\n\t\t\t\t<a class=\"leaflet-control-to-data\" title=\"Zoom to data\" ng-click=\"zoomToData()\"><i class=\"fa fa-object-group\"></i></a>\n\t\t\t</div>\n\t\t</div>\n\t\t<div class=\"row graph-metrics\" data-ng-show=\"displayMetrics\">\n\n\t\t    <div class=\"metrics closed col-lg-12 col-md-12\">\n\t\t      <div class=\"panel panel-default\">\n\n\t\t        <a class=\"metrics-toggle\" data-toggle=\"tooltip\" data-original-title=\"Metrics\" data-placement=\"bottom\">\n\t\t          <i class=\"fa fa-calculator\"></i>\n\t\t        </a>\n\n\t\t        <div class=\"panel-body\">\n\t\t\t\t\t\t\t<div class=\"alert alert-danger\" ng-show=\"!unimodal\">\n\t\t\t\t\t\t\t\t<div><strong>WARNING!</strong> The Metrics section only works for <em>unipartite</em> networks (ones that only allow links among a single type of object), but it seems you may have created a <em>bipartite</em> network. This <em>could</em> still be a unipartite network, but Palladio cannot verify it as such. If this is not a unipartite network, the results shown in this section are <em><strong>not valid</strong></em> and should be disregarded.</div><br>\n\t\t\t\t\t\t\t\t<div>To verify you have a unipartite network, link your data fields to the same \"Extension\" table in the Data section. For more information on bipartite/bimodal networks, see <a href=\"http://www.scottbot.net/HIAL/index.html@p=41158.html\" class=\"alert-link\">this blog post</a>.</div>\n\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t<div class=\"row\">\n\t\t\t\t\t\t\t\t<div class=\"col-md-8 metric-table\">\n\t\t\t\t\t\t\t\t\t\t<form>\n\t\t\t\t\t\t\t\t\t    <div class=\"form-group\">\n\t\t\t\t\t\t\t\t\t      <div class=\"input-group\">\n\t\t\t\t\t\t\t\t\t        <div class=\"input-group-addon\"><i class=\"fa fa-search\"></i></div>\n\t\t\t\t\t\t\t\t\t        <input type=\"text\" class=\"form-control\" placeholder=\"Search Nodes\" ng-model=\"searchNodes\">\n\t\t\t\t\t\t\t\t\t      </div>\n\t\t\t\t\t\t\t\t\t    </div>\n\t\t\t\t\t\t\t\t\t  </form>\n\t\t\t\t            <table class=\"table table-hover table-bordered table-striped\">\n\t\t\t\t              <thead>\n\t\t\t\t                <tr>\n\t\t\t\t                  <th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<a href=\"#\" ng-click=\"sortType = 'name'; sortReverse = !sortReverse\">\n\t\t\t\t\t\t\t\t\t            Node ID\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'name' && !sortReverse\" class=\"fa fa-caret-down\"></span>\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'name' && sortReverse\" class=\"fa fa-caret-up\"></span>\n\t\t\t\t\t\t\t\t\t          </a>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</th>\n\t\t\t\t                  <th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<a href=\"#\" ng-click=\"sortType = 'degree'; sortReverse = !sortReverse\">\n\t\t\t\t\t\t\t\t\t            Degree\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'degree' && sortReverse\" class=\"fa fa-caret-down\"></span>\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'degree' && !sortReverse\" class=\"fa fa-caret-up\"></span>\n\t\t\t\t\t\t\t\t\t          </a>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</th>\n\t\t\t\t                  <th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<a href=\"#\" ng-click=\"sortType = 'betweenness'; sortReverse = !sortReverse\">\n\t\t\t\t\t\t\t\t\t            Betweenness Centrality\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'betweenness' && sortReverse\" class=\"fa fa-caret-down\"></span>\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'betweenness' && !sortReverse\" class=\"fa fa-caret-up\"></span>\n\t\t\t\t\t\t\t\t\t          </a>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</th>\n\t\t\t\t                  <th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<a href=\"#\" ng-click=\"sortType = 'eigenvector'; sortReverse = !sortReverse\">\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tEigenvector Centrality\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<span ng-show=\"sortType == 'eigenvector' && sortReverse\" class=\"fa fa-caret-down\"></span>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<span ng-show=\"sortType == 'eigenvector' && !sortReverse\" class=\"fa fa-caret-up\"></span>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t</a>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</th>\n\t\t\t\t                  <th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<a href=\"#\" ng-click=\"sortType = 'clustering'; sortReverse = !sortReverse\">\n\t\t\t\t\t\t\t\t\t            Clustering Coefficient\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'clustering' && sortReverse\" class=\"fa fa-caret-down\"></span>\n\t\t\t\t\t\t\t\t\t            <span ng-show=\"sortType == 'clustering' && !sortReverse\" class=\"fa fa-caret-up\"></span>\n\t\t\t\t\t\t\t\t\t          </a>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</th>\n\t\t\t\t                </tr>\n\t\t\t\t              </thead>\n\t\t\t\t              <tbody>\n\t\t\t\t\t\t\t\t\t\t\t\t<tr ng-repeat=\"node in metrics.nodes | orderBy:sortType:sortReverse | filter:searchNodes\">\n\t\t\t\t\t\t\t\t\t\t\t\t\t<td>{{ node.name }}</td>\n\t\t\t\t\t\t\t\t\t\t\t\t\t<td>{{ node.degree }}</td>\n\t\t\t\t\t\t\t\t\t\t\t\t\t<td>{{ node.betweenness }}</td>\n\t\t\t\t\t\t\t\t\t\t\t\t\t<td>{{ node.eigenvector }}</td>\n\t\t\t\t\t\t\t\t\t\t\t\t\t<td>{{ node.clustering }}</td>\n\t\t\t\t\t\t\t\t\t\t\t\t</tr>\n\t\t\t\t              </tbody>\n\t\t\t\t            </table>\n\t\t\t\t        </div>\n\t\t\t\t\t\t\t\t<div class=\"col-md-4\">\n\t\t\t\t\t\t\t\t\t<div class=\"panel panel-default\">\n\t\t\t\t            <div class=\"panel-heading\">\n\t\t\t\t              <h4 class=\"panel-title\">\n\t\t\t\t                Global metrics\n\t\t\t\t              </h4>\n\t\t\t\t            </div>\n\t\t\t\t            <div class=\"panel-body\" id=\"info-panel\">\n\t\t\t\t\t\t\t\t\t\t\t<div>Number of Nodes: {{ metrics.nodecount }}</div>\n\t\t\t\t\t\t\t\t\t\t\t<div>Number of Edges: {{ metrics.edgecount }}</div>\n\t\t\t\t\t\t\t\t\t\t\t<div>Average Degree: {{ metrics.averageDegree }}</div>\n\t\t\t\t\t\t\t\t\t\t\t<div>Density: {{ metrics.density }}</div>\n\t\t\t\t\t\t\t\t\t\t\t<div>Avg. Clustering Coefficient: {{ metrics.averageClustering }}</div>\n\t\t\t\t\t\t\t\t\t\t\t<div>Transitivity: {{ metrics.transitivity }}</div>\n\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t          </div>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t</div>\n\n\t\t        </div>\n\n\t\t      </div>\n\t\t    </div>\n\n\t\t</div>\n\n\n</div>\n\n<!-- Settings -->\n<div class=\"row graph-settings\" data-ng-show=\"settings\">\n\n    <div class=\"settings closed col-lg-4 col-lg-offset-8 col-md-6 col-md-offset-6\">\n      <div class=\"panel panel-default\">\n\n        <a class=\"settings-toggle\" data-toggle=\"tooltip\" data-original-title=\"Settings\" data-placement=\"bottom\">\n          <i class=\"fa fa-bars\"></i>\n        </a>\n\n        <div class=\"panel-body\">\n\n          <div class=\"row\">\n            <div class=\"col-lg-12\">\n              <label>Settings</label>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Source</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showSourceModal()\">\n                  {{mapping.sourceDimension.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n\t\t\t\t\t<div class=\"row margin-top\">\n\t\t\t\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n\t\t\t\t\t\t\t<label class=\"inline\">Highlight</label>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t\t<input type=\"checkbox\" ng-model=\"highlightSource\">\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n\t\t\t\t\t<div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Target</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showTargetModal()\">\n                  {{mapping.targetDimension.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n\t\t\t\t\t<div class=\"row margin-top\">\n\t\t\t\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n\t\t\t\t\t\t\t<label class=\"inline\">Highlight</label>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t\t<input type=\"checkbox\" ng-model=\"highlightTarget\">\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n\n\t\t\t\t\t<div class=\"row margin-top\">\n\t\t\t\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n\t\t\t\t\t\t\t<label class=\"inline\">Show links</label>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t\t<input type=\"checkbox\" ng-model=\"showLinks\">\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n\t\t\t\t\t<div class=\"row margin-top\">\n\t\t\t\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n\t\t\t\t\t\t\t<label class=\"inline\">Size nodes</label>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t\t<input type=\"checkbox\" ng-model=\"nodeSize\">\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n\t\t\t\t\t<div class=\"row margin-top\" data-ng-show=\"nodeSize\">\n\t\t\t\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t\t\t\t<label class=\"inline\">According to</label>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t<span class=\"btn btn-default\" ng-click=\"showAggModal()\">\n\t\t\t\t\t\t\t\t{{getAggDescription(aggDim) || \"Choose\"}}\n\t\t\t\t\t\t\t\t<span class=\"caret\"></span>\n\t\t\t\t\t\t\t</span>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n\t\t\t\t\t<div class=\"row margin-top\">\n\t\t\t\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t<a class=\"pull-right\"\n\t\t\t\t\t\t\ttooltip=\"Download graph (svg)\"\n\t\t\t\t\t\t\ttooltip-animation=\"false\"\n\t\t\t\t\t\t\ttooltip-append-to-body=\"true\"\n\t\t\t\t\t\t\tng-click=\"exportSvg(this, 'Palladio Graph.svg')\">\n\t\t\t\t\t\t\t\t<i class=\"fa fa-download margin-right\"></i>Download\n\t\t\t\t\t\t\t</a>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n\n\n\n\n        </div>\n\n      </div>\n    </div>\n\n</div>\n\n<div id=\"{{uniqueModalId}}\">\n\t<div id=\"source-modal\" data-modal description=\"Choose source dimension\" dimensions=\"fields\" model=\"mapping.sourceDimension\"></div>\n\t<div id=\"target-modal\" data-modal description=\"Choose target dimension\" dimensions=\"fields\" model=\"mapping.targetDimension\"></div>\n\t<div id=\"agg-modal\" data-modal description=\"Choose aggregation for sizing nodes\" dimensions=\"aggDims\" model=\"aggDim\" description-accessor=\"getAggDescription\"></div>\n</div>\n");
}]);