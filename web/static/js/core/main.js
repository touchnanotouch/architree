document.addEventListener("alpine:init", function() {
    Alpine.data("app", function() {
        return {
            // Variables -------------------------------------------------------

            // Theme

            theme: localStorage.getItem("theme") || "dark",

            // Groups

            groups: [],

            groupName: "",
            groupColorIndex: 0,

            _dragIndex: null,
            _dragOverIndex: null,

            // Workspace

            scanned: false,
            loading: false,

            workspacePath: "",
            projectName: "",

            treeData: [],
            stats: null,

            expandedPaths: {},
            _pathType: {},
            chartRendered: false,

            // Navigation

            activeTab: "stats",

            // Tree View

            viewMode: "1",

            // Tests

            testTarget: "all",
            testResults: null,
            testRunning: false,

            // Selection

            selectedPaths: {},
            toolMode: "pan",
            selectMode: "normal",

            // Methods ---------------------------------------------------------

            // Init

            init: function() {
                this.applyTheme();
                this.loadGroups();
            },

            // Theme

            applyTheme: function() {
                document.documentElement.classList.toggle(
                    "light", this.theme === "light"
                );
            },

            toggleTheme: function() {
                this.theme = this.theme === "dark" ? "light" : "dark";

                localStorage.setItem("theme", this.theme);

                this.applyTheme();
            },

            // Groups

            saveGroups: function() {
                localStorage.setItem("groups", JSON.stringify(this.groups));
            },

            loadGroups: function() {
                var saved = localStorage.getItem("groups");

                if (saved) {
                    try {
                        var parsed = JSON.parse(saved);

                        parsed.forEach(function(g) {
                            if (g.paths) {
                                g.paths = g.paths.map(function(p) {
                                    return p.replace(/\\/g, "/");
                                });
                            }
                        });

                        this.groups = parsed.filter(function(g) {
                            return g.paths && g.paths.length;
                        });
                        this.groupColorIndex = this.groups.length;
                    } catch (e) {
                        console.error("Failed to load groups:", e);
                    }
                }
            },

            createGroup: function() {
                var name = this.groupName.trim();

                if (!name) {
                    return;
                }

                var selected = Object.keys(this.selectedPaths);

                if (!selected.length) {
                    return;
                }

                var color = this._nextGroupColor();

                var newPaths;

                switch (this.selectMode) {
                    case "asc":
                        newPaths = this._collectAncestors(selected);
                        break;
                    case "desc":
                        newPaths = this._collectDescendants(selected, this.treeData);
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

                    if (i === existingIndex) {
                        continue;
                    }

                    var filtered = [];

                    for (var j = 0; j < g.paths.length; j++) {
                        if (!newPathsSet[g.paths[j]]) {
                            filtered.push(g.paths[j]);
                        }
                    }

                    if (filtered.length) {
                        clean.push({
                            name: g.name,
                            paths: filtered,
                            color: g.color,
                        });
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

            renameGroup: function(oldName, newName) {
                newName = newName.trim();

                if (!newName || newName === oldName) {
                    return;
                }
                if (this.groups.some(function(g) { return g.name === newName; })) {
                    return;
                }

                var group = null;

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === oldName) {
                        group = this.groups[i];
                        break;
                    }
                }

                if (!group) {
                    return;
                }

                group.name = newName;

                this.saveGroups();
                this.renderTreeView();
            },

            setGroupColor: function(name, color) {
                var group = null;

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === name) {
                        group = this.groups[i];
                        break;
                    }
                }

                if (!group) {
                    return;
                }

                group.color = color;

                this.saveGroups();
                this.renderTreeView();
            },

            removePath: function(groupName, path) {
                var group = null;

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === groupName) {
                        group = this.groups[i];
                        break;
                    }
                }

                if (!group) {
                    return;
                }

                var filtered = [];

                for (var i = 0; i < group.paths.length; i++) {
                    if (group.paths[i] !== path) {
                        filtered.push(group.paths[i]);
                    }
                }

                if (filtered.length) {
                    group.paths = filtered;
                } else {
                    this.groups = this.groups.filter(
                        function(g) { return g.name !== groupName; }
                    );
                }

                this.saveGroups();
                this.renderTreeView();
            },

            deleteGroup: function(name) {
                this.groups = this.groups.filter(
                    function(g) { return g.name !== name; }
                );

                this.saveGroups();
                this.renderTreeView();
            },

            onDragStart: function(index, event) {
                this._dragIndex = index;

                event.dataTransfer.effectAllowed = "move";
            },

            onDrop: function(index) {
                if (this._dragIndex === null || this._dragIndex === index) {
                    this._dragIndex = null;
                    return;
                }

                var groups = this.groups.slice();

                var item = groups.splice(this._dragIndex, 1)[0];
                var target = index;

                groups.splice(target, 0, item);

                this.groups = groups;
                this._dragIndex = null;

                this.saveGroups();
                this.renderTreeView();
            },

            onDragEnd: function() {
                this._dragIndex = null;
            },

            groupStats: function(g) {
                var files = 0, dirs = 0;

                for (var i = 0; i < g.paths.length; i++) {
                    if (this._pathType[g.paths[i]] === "dir") {
                        dirs++;
                    } else {
                        files++;
                    }
                }

                var parts = [];

                if (files) {
                    parts.push(files + " file" + (files !== 1 ? "s" : ""));
                }
                if (dirs) {
                    parts.push(dirs + " dir" + (dirs !== 1 ? "s" : ""));
                }

                return parts.length ? parts.join(", ") : "0 items";
            },

            // Workspace

            scanWorkspace: async function() {
                var path = this.workspacePath.trim();

                if (!path) {
                    return;
                }

                this.loading = true;
                this.testResults = null;

                try {
                    var data = await API.post("/api/scan", { path: path });

                    this.projectName = data.name || (path.split(/[/\\]/).filter(Boolean).pop()) || path;
                    this.treeData = data.tree || [];
                    this.stats = data.stats || null;
                    this.expandedPaths = {};
                    this._pathType = {};

                    var self = this;

                    function normalizePaths(nodes) {
                        for (var i = 0; i < nodes.length; i++) {
                            nodes[i].path = nodes[i].path.replace(/\\/g, "/");

                            self._pathType[nodes[i].path] = nodes[i].type;

                            if (nodes[i].children && nodes[i].children.length) {
                                normalizePaths(nodes[i].children);
                            }
                        }
                    }

                    normalizePaths(this.treeData);

                    resetVisualCache();

                    this.chartRendered = false;
                    this.scanned = true;
                    this.activeTab = "stats";

                    this.$nextTick(function() {
                        renderSidebarTree(
                            "tree-container", self.treeData, self.expandedPaths,
                            function(p) { self.toggleExpand(p); },
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

            // Navigation

            switchTab: function(tab) {
                this.activeTab = tab;

                var self = this;

                this.$nextTick(function() { self.renderActiveView(); });
            },

            renderActiveView: function() {
                switch (this.activeTab) {
                    case "tree":
                        this.renderTreeView();
                        break;
                    case "stats":
                        this.renderChart();
                        break;
                }
            },

            // Chart

            renderChart: function() {
                if (this.chartRendered || !this.stats || !this.stats.languages || !this.stats.languages.length) {
                    return;
                }

                if (typeof renderLanguageChart === "function") {
                    renderLanguageChart(this.stats.languages, "#lang-chart");
                }

                this.chartRendered = true;
            },

            // Tree View

            renderTreeView: function() {
                var self = this;

                renderSidebarTree(
                    "tree-container", this.treeData, this.expandedPaths,
                    function(p) { self.toggleExpand(p); },
                    this.groups
                );

                renderVisualTree(
                    "#tree-svg", this.treeData, this.expandedPaths,
                    function(p) { self.toggleExpand(p); },
                    this.toolMode, this.selectedPaths, this.groups,
                    function(p) { self.toggleSelect(p); },
                    this.viewMode
                );
            },

            toggleExpand: function(path) {
                this.expandedPaths[path] = !this.expandedPaths[path];

                var self = this;

                renderSidebarTree(
                    "tree-container", this.treeData, this.expandedPaths,
                    function(p) { self.toggleExpand(p); },
                    this.groups
                );

                if (this.activeTab === "tree") {
                    renderVisualTree(
                        "#tree-svg", this.treeData, this.expandedPaths,
                        function(p) { self.toggleExpand(p); },
                        this.toolMode, this.selectedPaths, this.groups,
                        function(p) { self.toggleSelect(p); },
                        this.viewMode
                    );
                }
            },

            // Tests

            runTests: async function() {
                if (!this.scanned || this.testRunning) {
                    return;
                }

                this.testRunning = true;
                this.testResults = null;

                try {
                    var data = await API.post("/api/tests/run", {
                        path: this.workspacePath,
                        target: this.testTarget,
                    });

                    this.testResults = data;
                } catch (err) {
                    console.error("Tests failed:", err);
                } finally {
                    this.testRunning = false;
                }
            },

            // Selection

            selectedCount: function() {
                return Object.keys(this.selectedPaths).length;
            },

            switchToolMode: function(mode) {
                this.toolMode = mode;
                this.renderTreeView();
            },

            toggleSelect: function(path) {
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

            // Private

            _collectAncestors: function(paths) {
                var result = {};

                for (var i = 0; i < paths.length; i++) {
                    var parts = paths[i].split("/").filter(Boolean);

                    var cur = "";

                    for (var j = 0; j < parts.length; j++) {
                        cur = cur ? cur + "/" + parts[j] : parts[j];

                        result[cur] = true;
                    }
                }

                return Object.keys(result);
            },

            _collectDescendants: function(paths, nodes) {
                var result = {};
                var pathToNode = {};

                function buildLookup(nodes) {
                    for (var i = 0; i < nodes.length; i++) {
                        pathToNode[nodes[i].path] = nodes[i];

                        if (nodes[i].children) {
                            buildLookup(nodes[i].children);
                        }
                    }
                }

                buildLookup(nodes);

                for (var i = 0; i < paths.length; i++) {
                    result[paths[i]] = true;

                    var node = pathToNode[paths[i]];

                    if (node && node.children) {
                        this._walkDescendants(node.children, result);
                    }
                }

                return Object.keys(result);
            },

            _walkDescendants: function(nodes, result) {
                for (var i = 0; i < nodes.length; i++) {
                    result[nodes[i].path] = true;

                    if (nodes[i].children) {
                        this._walkDescendants(nodes[i].children, result);
                    }
                }
            },

            _nextGroupColor: function() {
                var hue = (this.groupColorIndex * 137.508) % 360;

                this.groupColorIndex++;

                return "hsl(" + hue + ", 70%, 55%)";
            },
        };
    });
});
