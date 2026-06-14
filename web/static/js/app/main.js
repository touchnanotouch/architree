(function () {
    "use strict";

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async function bootstrap() {
        var _origQMT = window.queueMicrotask;
        var _alpineStart = null;
        window.queueMicrotask = function (fn) {
            _alpineStart = fn;
            window.queueMicrotask = _origQMT;
        };

        // Load libraries

        await loadScript("/static/js/lib/d3.v7.min.js");
        await loadScript("/static/js/lib/alpine.min.js");

        // Import app modules

        var m = await Promise.all([
            import("/static/js/app/core/api.js"),
            import("/static/js/app/core/config.js"),
            import("/static/js/app/util/color.js"),
            import("/static/js/app/util/selection.js"),
            import("/static/js/app/ui/sidebar.js"),
            import("/static/js/app/ui/tree.js"),
            import("/static/js/app/ui/chart.js"),
        ]);

        var API = m[0].API;

        var fetchGroups = m[1].loadGroups;
        var persistGroups = m[1].saveGroups;
        var nextGroupColor = m[2].nextGroupColor;
        var collectAncestors = m[3].collectAncestors;
        var collectDescendants = m[3].collectDescendants;
        var renderSidebarTree = m[4].renderSidebarTree;
        var resetVisualCache = m[5].resetVisualCache;
        var renderVisualTree = m[5].renderVisualTree;
        var renderLanguageChart = m[6].renderLanguageChart;

        // Register Alpine component

        Alpine.data("app", function () {
            return {
                // State

                theme: localStorage.getItem("theme") || "dark",

                groups: [],
                groupName: "",
                groupColorIndex: 0,
                _dragIndex: null,
                _dragOverIndex: null,

                scanned: false,
                loading: false,
                workspacePath: "",
                projectName: "",
                treeData: [],
                stats: null,
                expandedPaths: {},
                _pathType: {},
                chartRendered: false,

                activeTab: "stats",

                viewMode: "1",

                testTarget: "all",
                testResults: null,
                testRunning: false,

                selectedPaths: {},
                toolMode: "pan",
                selectMode: "normal",

                // Init

                init: function () {
                    this.applyTheme();
                },

                applyTheme: function () {
                    document.documentElement.classList.toggle(
                        "light", this.theme === "light"
                    );
                },

                toggleTheme: function () {
                    this.theme = this.theme === "dark" ? "light" : "dark";
                    localStorage.setItem("theme", this.theme);
                    this.applyTheme();
                },

                // Groups

                saveGroups: function () {
                    if (!this.workspacePath) return;

                    persistGroups(this.workspacePath, this.groups).catch(function (err) {
                        console.error("Failed to save config:", err);
                    });
                },

                loadProjectConfig: async function (path) {
                    try {
                        this.groups = await fetchGroups(path);
                    } catch (_e) {
                        // Config file doesn't exist yet - start with empty groups
                    }
                },

                createGroup: function () {
                    var name = this.groupName.trim();
                    if (!name) return;

                    var selected = Object.keys(this.selectedPaths);
                    if (!selected.length) return;

                    var color = nextGroupColor(this.groupColorIndex);
                    var newPaths;

                    switch (this.selectMode) {
                        case "asc":
                            newPaths = collectAncestors(selected);
                            break;
                        case "desc":
                            newPaths = collectDescendants(selected, this.treeData);
                            break;
                        default:
                            newPaths = selected.slice();
                    }

                    var existing = null;
                    var existingIndex = -1;
                    for (var i = 0; i < this.groups.length; i++) {
                        if (this.groups[i].name === name) {
                            existing = this.groups[i];
                            existingIndex = i;
                            break;
                        }
                    }

                    var clean = [];
                    var newPathsSet = {};
                    for (var i = 0; i < newPaths.length; i++) {
                        newPathsSet[newPaths[i]] = true;
                    }
                    for (var i = 0; i < this.groups.length; i++) {
                        var g = this.groups[i];
                        if (i === existingIndex) continue;

                        var filtered = [];
                        for (var j = 0; j < g.paths.length; j++) {
                            if (!newPathsSet[g.paths[j]]) {
                                filtered.push(g.paths[j]);
                            }
                        }
                        if (filtered.length) {
                            clean.push({ name: g.name, paths: filtered, color: g.color });
                        }
                    }

                    clean.push({
                        name: name,
                        paths: newPaths,
                        color: existing ? existing.color : color,
                    });

                    this.groups = clean;
                    this.groupName = "";
                    this.selectedPaths = {};
                    this.saveGroups();
                    this.renderTreeView();
                },

                renameGroup: function (oldName, newName) {
                    newName = newName.trim();
                    if (!newName || newName === oldName) return;
                    if (this.groups.some(function (g) { return g.name === newName; })) return;

                    var group = null;
                    for (var i = 0; i < this.groups.length; i++) {
                        if (this.groups[i].name === oldName) {
                            group = this.groups[i];
                            break;
                        }
                    }
                    if (!group) return;

                    group.name = newName;
                    this.saveGroups();
                    this.renderTreeView();
                },

                setGroupColor: function (name, color) {
                    var group = null;
                    for (var i = 0; i < this.groups.length; i++) {
                        if (this.groups[i].name === name) {
                            group = this.groups[i];
                            break;
                        }
                    }
                    if (!group) return;

                    group.color = color;
                    this.saveGroups();
                    this.renderTreeView();
                },

                removePath: function (groupName, path) {
                    var group = null;
                    for (var i = 0; i < this.groups.length; i++) {
                        if (this.groups[i].name === groupName) {
                            group = this.groups[i];
                            break;
                        }
                    }
                    if (!group) return;

                    var filtered = [];
                    for (var i = 0; i < group.paths.length; i++) {
                        if (group.paths[i] !== path) {
                            filtered.push(group.paths[i]);
                        }
                    }
                    if (filtered.length) {
                        group.paths = filtered;
                    } else {
                        this.groups = this.groups.filter(function (g) {
                            return g.name !== groupName;
                        });
                    }
                    this.saveGroups();
                    this.renderTreeView();
                },

                deleteGroup: function (name) {
                    this.groups = this.groups.filter(function (g) {
                        return g.name !== name;
                    });
                    this.saveGroups();
                    this.renderTreeView();
                },

                onDragStart: function (index, event) {
                    this._dragIndex = index;
                    event.dataTransfer.effectAllowed = "move";
                },

                onDrop: function (index) {
                    if (this._dragIndex === null || this._dragIndex === index) {
                        this._dragIndex = null;
                        return;
                    }

                    var groups = this.groups.slice();
                    var item = groups.splice(this._dragIndex, 1)[0];
                    groups.splice(index, 0, item);
                    this.groups = groups;
                    this._dragIndex = null;
                    this.saveGroups();
                    this.renderTreeView();
                },

                onDragEnd: function () {
                    this._dragIndex = null;
                },

                groupStats: function (g) {
                    var files = 0, dirs = 0;

                    for (var i = 0; i < g.paths.length; i++) {
                        if (this._pathType[g.paths[i]] === "dir") {
                            dirs++;
                        } else {
                            files++;
                        }
                    }

                    var parts = [];
                    if (files) parts.push(files + " file" + (files !== 1 ? "s" : ""));
                    if (dirs) parts.push(dirs + " dir" + (dirs !== 1 ? "s" : ""));
                    return parts.length ? parts.join(", ") : "0 items";
                },

                // Workspace

                scanWorkspace: async function () {
                    var path = this.workspacePath.trim();
                    if (!path) return;

                    this.loading = true;
                    this.testResults = null;
                    this.groups = [];

                    try {
                        var data = await API.post("/api/scan", { path: path });

                        this.projectName = data.name
                            || (path.split(/[/\\]/).filter(Boolean).pop())
                            || path;
                        this.treeData = data.tree || [];
                        this.stats = data.stats || null;
                        this.expandedPaths = {};
                        this._pathType = {};

                        function normalizePaths(nodes) {
                            for (var i = 0; i < nodes.length; i++) {
                                nodes[i].path = nodes[i].path.replace(/\\/g, "/");
                                this._pathType[nodes[i].path] = nodes[i].type;

                                if (nodes[i].children && nodes[i].children.length) {
                                    normalizePaths.call(this, nodes[i].children);
                                }
                            }
                        }
                        normalizePaths.call(this, this.treeData);

                        resetVisualCache();

                        this.chartRendered = false;
                        this.scanned = true;
                        this.activeTab = "stats";

                        await this.loadProjectConfig(path);

                        var self = this;
                        this.$nextTick(function () {
                            renderSidebarTree(
                                "tree-container", self.treeData, self.expandedPaths,
                                function (p) { self.toggleExpand(p); },
                                self.groups
                            );
                            self.renderActiveView();
                        });
                    } catch (err) {
                        console.error("Scan failed:", err);
                    } finally {
                        this.loading = false;
                    }
                },

                // Tabs

                switchTab: function (tab) {
                    this.activeTab = tab;

                    var self = this;
                    this.$nextTick(function () {
                        self.renderActiveView();
                    });
                },

                renderActiveView: function () {
                    switch (this.activeTab) {
                        case "tree":
                            this.renderTreeView();
                            break;
                        case "stats":
                            this.renderChart();
                            break;
                    }
                },

                renderChart: function () {
                    if (this.chartRendered
                        || !this.stats
                        || !this.stats.languages
                        || !this.stats.languages.length) {
                        return;
                    }

                    renderLanguageChart(this.stats.languages, "#lang-chart");
                    this.chartRendered = true;
                },

                renderTreeView: function () {
                    var self = this;

                    renderSidebarTree(
                        "tree-container", this.treeData, this.expandedPaths,
                        function (p) { self.toggleExpand(p); },
                        this.groups
                    );

                    renderVisualTree(
                        "#tree-svg", this.treeData, this.expandedPaths,
                        function (p) { self.toggleExpand(p); },
                        this.toolMode, this.selectedPaths, this.groups,
                        function (p) { self.toggleSelect(p); },
                        this.viewMode
                    );
                },

                toggleExpand: function (path) {
                    this.expandedPaths[path] = !this.expandedPaths[path];

                    var self = this;

                    renderSidebarTree(
                        "tree-container", this.treeData, this.expandedPaths,
                        function (p) { self.toggleExpand(p); },
                        this.groups
                    );

                    if (this.activeTab === "tree") {
                        renderVisualTree(
                            "#tree-svg", this.treeData, this.expandedPaths,
                            function (p) { self.toggleExpand(p); },
                            this.toolMode, this.selectedPaths, this.groups,
                            function (p) { self.toggleSelect(p); },
                            this.viewMode
                        );
                    }
                },

                // Tests

                runTests: async function () {
                    if (!this.scanned || this.testRunning) return;

                    this.testRunning = true;
                    this.testResults = null;

                    try {
                        this.testResults = await API.post("/api/tests/run", {
                            path: this.workspacePath,
                            target: this.testTarget,
                        });
                    } catch (err) {
                        console.error("Tests failed:", err);
                    } finally {
                        this.testRunning = false;
                    }
                },

                // Selection

                selectedCount: function () {
                    return Object.keys(this.selectedPaths).length;
                },

                switchToolMode: function (mode) {
                    this.toolMode = mode;
                    this.renderTreeView();
                },

                toggleSelect: function (path) {
                    if (path === null) {
                        this.selectedPaths = {};
                    } else {
                        var key = path.replace(/\\/g, "/");
                        this.selectedPaths[key] = !this.selectedPaths[key];
                        if (!this.selectedPaths[key]) {
                            delete this.selectedPaths[key];
                        }
                    }
                    this.renderTreeView();
                },

            };
        });

        // Start Alpine now that all data is registered
        _alpineStart();
    }

    bootstrap().catch(function (err) {
        console.error("ArchiTree bootstrap failed:", err);
    });
})();
