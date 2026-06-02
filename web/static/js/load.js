(function() {
    var scripts = [
        "/static/js/core/api.js",
        "/static/js/components/tree.js",
        "/static/js/components/tree-visual.js",
        "/static/js/components/chart.js",
        "/static/js/components/tests.js",
        "/static/js/lib/d3.v7.min.js",
        "/static/js/main.js",
        "/static/js/lib/alpine.min.js",
    ]

    var i = 0;

    (function next() {
        if (i >= scripts.length) {
            return
        }

        var src = scripts[i++]
        var s = document.createElement("script")

        s.src = src
        s.onload = s.onerror = next

        document.head.appendChild(s)
    })()
})()
