const shaders = `
const PI: f32 = 3.14159265358;

fn radians(x: f32) -> f32 { return x * PI / 180.0; }

struct Settings {
	ratio: f32,
	hfov: f32,
	canv: vec2f
};

@group(0) @binding(0) var our_sampler: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(0) @binding(2) var<uniform> settings: Settings;

const RATIO: f32 = 564.0 / 1024.0;

const hfov: f32 = 140.0 * PI / 180.0;

// +Z is from the camera to the image plane
// +Y is from the camera directly up
// +X is from the camera directly right

struct VertexOut {
	@builtin(position) position : vec4f
}

@vertex
fn vertex_main(@location(0) position: vec4f) -> VertexOut {
	var output : VertexOut;
	output.position = position;
	return output;
}

fn within(val: f32, lim: f32) -> bool {
return val < lim && val > -lim;
}

fn map(value: f32, min1: f32, max1: f32, min2: f32, max2: f32) -> f32 {
	return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

fn ll_to_cart(lon: f32, lat: f32) -> vec3f {
var x = cos(lat) * cos(lon);
var y = cos(lat) * sin(lon);
var z = sin(lat);
return vec3f(y, z, x);
}
@fragment
fn fragment_main(frag_data: VertexOut) -> @location(0) vec4f {
	// Normalized pixel coordinates (from 0 to 1)
	var uv = frag_data.position.xy / settings.canv;

	var width = 2.0 * sin(settings.hfov / 2.0);
	var height = width * settings.ratio;

	var h = width / tan(settings.hfov / 2.0) / 2.0;

	var lat = map(uv.y, 0.0, 1.0, -PI / 2.0, PI / 2.0);
	var lon = map(uv.x, 0.0, 1.0, -PI / 2.0, PI / 2.0);

	var world = ll_to_cart(lon, lat);
	var plane = world.xy / world.z * h;

	var x = map(plane.x, -width / 2.0, width / 2.0, 0.0, 1.0);
	var y = map(plane.y, -height / 2.0, height / 2.0, 0.0, 1.0);
	var sampled = textureSample(tex, our_sampler, vec2f(x, y));

	if (within(plane.x, width / 2.0) && within(plane.y, height / 2.0)) {
		return sampled;
	} else {
		return vec4f(0, 0, 0, 0);
	}
}
`;