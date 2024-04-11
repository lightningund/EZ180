const shaders = document.getElementById("shaders").textContent;

const canv = document.getElementById("smooshed");
const ctxt = canv.getContext("webgpu");

let adapter;
let device;
let render_pipeline;
let cmd_encoder;
let pass_enc;

async function initGPU() {
	if (!navigator.gpu) throw Error("WebGPU not supported");

	adapter = await navigator.gpu.requestAdapter();
	if (!adapter) throw Error("Couldn't request WebGPU Adapter");

	device = await adapter.requestDevice();
	if (!device) throw Error("Couldn't request WebGPU Device");

	ctxt.configure({
		device: device,
		format: navigator.gpu.getPreferredCanvasFormat(),
		alphaMode: "premultiplied"
	});
}

initGPU();

// The following code is inspired heavily by the input code from SauceNAO
const quick_check_url = str => (/^((http|https|data):)/).test(str);

function url_to_data(url) {
	return new Promise((res, rej) => {
		const img = document.createElement("img");

		img.onload = function () {
			console.log(this.width, this.height);
			const canv = document.createElement("canvas");
			canv.width = this.width;
			canv.height = this.height;
			const local_ctxt = canv.getContext("2d");
			local_ctxt.drawImage(img, 0, 0);
			document.body.appendChild(canv);

			res(local_ctxt.getImageData(0, 0, this.width, this.height));
		}

		img.src = url;
	});
}

async function showImageURL(url) {
	//console.log(url);

	if (!quick_check_url(url)) throw Error("Invalid Image");

	const img_dat = await url_to_data(url);
	console.log(img_dat);

	const shader_mod = device.createShaderModule({ code: shaders });

	const verts = new Float32Array([
		1, -1, 0, 1,
		-1, -1, 0, 1,
		1, 1, 0, 1,
		-1, 1, 0, 1,
	]);

	const vertex_buffer = device.createBuffer({
		size: verts.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	});

	device.queue.writeBuffer(vertex_buffer, 0, verts, 0, verts.length);

	const vertex_buffers = [
		{
			attributes: [
				{
					shaderLocation: 0, // position
					offset: 0,
					format: "float32x4"
				}
			],
			arrayStride: 16,
			stepMode: "vertex"
		}
	];

	const pipeline_desc = {
		vertex: {
			module: shader_mod,
			entryPoint: "vertex_main",
			buffers: vertex_buffers
		},
		fragment: {
			module: shader_mod,
			entryPoint: "fragment_main",
			targets: [
				{ format: navigator.gpu.getPreferredCanvasFormat() }
			]
		},
		primitive: {
			topology: "triangle-strip"
		},
		layout: "auto"
	};

	render_pipeline = device.createRenderPipeline(pipeline_desc);

	cmd_encoder = device.createCommandEncoder();

	const render_pass_desc = {
		colorAttachments: [
			{
				clearValue: { r: 0, g: 0.5, b: 1, a: 1 },
				loadOp: "clear",
				storeOp: "store",
				view: ctxt.getCurrentTexture().createView()
			}
		]
	};

	const texture = device.createTexture({
		size: [img_dat.width, img_dat.height],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
	});

	device.queue.writeTexture(
		{ texture },
		img_dat.data,
		{ bytesPerRow: img_dat.width * 4 },
		{ width: img_dat.width, height: img_dat.height }
	);

	const sampler = device.createSampler();

	const bind_group = device.createBindGroup({
		layout: render_pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: sampler },
			{ binding: 1, resource: texture.createView() }
		]
	});

	pass_enc = cmd_encoder.beginRenderPass(render_pass_desc);

	pass_enc.setPipeline(render_pipeline);
	pass_enc.setBindGroup(0, bind_group);
	pass_enc.setVertexBuffer(0, vertex_buffer);
	pass_enc.draw(4);

	pass_enc.end();

	device.queue.submit([cmd_encoder.finish()]);
}

function showImageFile(fileInput) {
	let fr = new FileReader();

	fr.onload = function() {
		let dataURL = fr.result;
		showImageURL(dataURL);
	}

	fr.readAsDataURL(fileInput.files[0]);
}

// Called
function checkImageFile(fileInput) {
	let imageDisplay = document.getElementById("imagePreview");
	let searchButton = document.getElementById("searchButton");
	let fileMB = fileInput.files[0].size / 1024 / 1024;
	let fileName = fileInput.value.trim().toLowerCase();
	let typeRegex = new RegExp("\.(png|jpe?g|gif|bmp|webp)$");
	let fsizeMax = parseInt((localStorage.getItem("fsizeMax")));

	if (fsizeMax == undefined) {
		fsizeMax = 15; // most common value
	}

	if (fileMB > fsizeMax) {
		// too big
		imageDisplay.innerHTML = "<span class='previewErrorText'>Image Too Large!</span>";
		fileInput.value= ''; // clear file input
		searchButton.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else if (!(typeRegex.test(fileName))) {
		// bad filetype - should pull type list from db
		imageDisplay.innerHTML = "<span class='previewErrorText'>Image Type Not Supported!</span>";
		fileInput.value= ''; // clear file input
		searchButton.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else {
		// good - clear the url input and submit if auto
		let urlInput = document.getElementById("urlInput");
		urlInput.value = urlInput.defaultValue; // reset to the default text value
		showImageFile(fileInput); // display new image and activate search button
	}
}

// Called
function getURLInput(urlInput) {
	if (urlInput.value == "") {
		urlInput.value = urlInput.defaultValue; // reset to the default url input text value
	} else {
		document.getElementById("fileInput").value = ""; // clear the file input
		showImageURL(urlInput.value); // show image
		if (document.getElementById("auto-cb").checked) {
			searchReady = false;
			document.getElementById("searchForm").submit();
		}
	}
}

function imageURLError() {
	let imageDisplay = document.getElementById("imagePreview");
	imageDisplay.innerHTML = "<span class=\"previewInfoText\">Image Preview Unavailable</span>";
}

// Called
function clearValue(elem) {
	if (elem.value == elem.defaultValue) {
		elem.value = "";
	}
}

document.onpaste = function(event) {
	urlInput = document.getElementById("urlInput");

	if (event.target == urlInput) {
		// don't interfere with paste to url box - allows ios to paste image links properly
		// give some time for paste to finish normally before checking
		setTimeout(function() { getURLInput(urlInput); }, 4);
		return;
	} else {
		event.preventDefault();
		clipboardData = (event.clipboardData || event.originalEvent.clipboardData);
		if (typeof clipboardData.files[0] == "undefined") {
			urlInput.value = clipboardData.getData('Text');
			getURLInput(urlInput);
		} else {
			fileInput = document.getElementById("fileInput");
			fileInput.files = clipboardData.files;
			checkImageFile(fileInput);
		}
	}
}