var _chartResizeHandler = null;

function renderLanguageChart(data, selector) {
    var el = document.querySelector(selector);

    if (!el || typeof d3 === "undefined") {
        return;
    }

    var width = el.clientWidth;
    var height = el.clientHeight || 300;
    var radius = Math.min(width, height) / 2 * 0.8;

    d3.select(el).selectAll("svg.lang-chart").remove();

    var color;

    if (data.length <= 8) {
        color = d3.scaleOrdinal(d3.schemeSet2);
    } else {
        color = d3.scaleOrdinal();
        color.range(data.map(function(_, i) {
            var hue = (i * 137.508) % 360;
            return "hsl(" + hue + ", 70%, 55%)";
        }));
    }

    var svg = d3.select(el)
        .append("svg")
        .attr("class", "lang-chart")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + (width / 2) + ", " + (height / 2) + ")");

    var pie = d3.pie().value(function(d) { return d.value; });
    var arc = d3.arc().innerRadius(radius * 0.4).outerRadius(radius);
    var outerArc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 0.7);

    var slices = svg.selectAll(".slice")
        .data(pie(data))
        .enter().append("g")
        .attr("class", "slice");

    slices.append("path")
        .attr("d", arc)
        .attr("fill", function(d) { return color(d.data.label); })
        .attr("stroke", "var(--bg)")
        .attr("stroke-width", 2);

    slices.append("text")
        .attr("transform", function(d) {
            var pos = outerArc.centroid(d);
            var mid = d.startAngle + (d.endAngle - d.startAngle) / 2;
            pos[0] = radius * 0.9 * (mid < Math.PI ? 1 : -1);
            return "translate(" + pos + ")";
        })
        .attr("dy", "0.35em")
        .style("text-anchor", function(d) {
            var mid = d.startAngle + (d.endAngle - d.startAngle) / 2;
            return mid < Math.PI ? "start" : "end";
        })
        .style("fill", "var(--text)")
        .style("font-size", "12px")
        .text(function(d) { return d.data.label + " (" + d.data.value + ")"; });

    if (_chartResizeHandler) {
        window.removeEventListener("resize", _chartResizeHandler);
    }

    _chartResizeHandler = function() {
        renderLanguageChart(data, selector);
    };

    window.addEventListener("resize", _chartResizeHandler);
}
