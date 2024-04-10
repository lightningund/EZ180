// Vast majority of the following code is blatantly stolen from saucenao
let searchReady = false;
function isSearchReady() {
	if (searchReady) {
		searchReady = false;
		return true;
	} else {
		let imageDisplay = document.getElementById("imagePreview");
		imageDisplay.innerHTML = "<span class='previewErrorText'>Please Select an Image First!</span>";
		return false;
	}
}

const quick_check_url = str => (/^((http|https|data):)/).test(str);

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

// Called
function checkImageFile(fileInput) {
	let imageDisplay = document.getElementById("imagePreview");
	let searchButton = document.getElementById("searchButton");
	let fileMB = fileInput.files[0].size / 1024 / 1024;
	let fileName = fileInput.value.trim().toLowerCase();
	let typeRegex = new RegExp("\.(png|jpe?g|gif|bmp|webp)$");
	let fsizeMax = parseInt((localStorage.getItem("fsizeMax")));

	if (typeof fsizeMax == "undefined" || fsizeMax == null) {
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
		if (document.getElementById("auto-cb").checked) {
			searchReady = false;
			document.getElementById("searchForm").submit();
		}
	}
}

function showImageURL(url) {
	let imageDisplay = document.getElementById("imagePreview");
	let searchButton = document.getElementById("searchButton");

	if (!quick_check_url(url)) {
		imageDisplay.innerHTML = "<span class=\"previewErrorText\">Invalid Image URL!</span>";
		searchButton.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else {
		imageDisplay.innerHTML = `<div style="width: 100%; height: 100%;"><img src="${url}" onerror="imageURLError();"></div>`;
		searchButton.classList.add("searchButtonActive"); // activate search button
		searchReady = true;
	}
}

function imageURLError() {
	let imageDisplay = document.getElementById("imagePreview");
	imageDisplay.innerHTML = "<span class=\"previewInfoText\">Image Preview Unavailable</span>";
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