let _chartResizeHandler = null;

function renderLanguageChart(data, selector) {
    const el = document.querySelector(selector);

    if (!el || typeof d3 === "undefined") {
        return;
    }

    const width = el.clientWidth;
    const height = el.clientHeight || 300;
    const radius = Math.min(width, height) / 2 * 0.8;

    d3.select(el).selectAll("svg.lang-chart").remove();

    let color;

    if (data.length <= 8) {
        color = d3.scaleOrdinal(d3.schemeSet2);
    } else {
        color = d3.scaleOrdinal();
        color.range(data.map((_, i) => {
            const hue = (i * 137.508) % 360;
            return "hsl(" + hue + ", 70%, 55%)";
        }));
    }

    const svg = d3.select(el)
        .append("svg")
        .attr("class", "lang-chart")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + (width / 2) + ", " + (height / 2) + ")");

    const pie = d3.pie().value(d => d.value);
    const arc = d3.arc().innerRadius(radius * 0.4).outerRadius(radius);
    const outerArc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 0.7);

    const slices = svg.selectAll(".slice")
        .data(pie(data))
        .enter().append("g")
        .attr("class", "slice");

    slices.append("path")
        .attr("d", arc)
        .attr("fill", d => color(d.data.label))
        .attr("stroke", "var(--bg)")
        .attr("stroke-width", 2);

    slices.append("text")
        .attr("transform", d => {
            const pos = outerArc.centroid(d);
            const mid = d.startAngle + (d.endAngle - d.startAngle) / 2;
            pos[0] = radius * 0.9 * (mid < Math.PI ? 1 : -1);
            return "translate(" + pos + ")";
        })
        .attr("dy", "0.35em")
        .style("text-anchor", d => {
            const mid = d.startAngle + (d.endAngle - d.startAngle) / 2;
            return mid < Math.PI ? "start" : "end";
        })
        .style("fill", "var(--text)")
        .style("font-size", "12px")
        .text(d => d.data.label + " (" + d.data.value + ")");

    if (_chartResizeHandler) {
        window.removeEventListener("resize", _chartResizeHandler);
    }

    _chartResizeHandler = () => {
        renderLanguageChart(data, selector);
    };

    window.addEventListener("resize", _chartResizeHandler);
}