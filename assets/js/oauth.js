jQuery(function($) {

	var $customizer		= $("#customizer");
	var $iframe			= $("#cm-theme-preview");
	var $spinner		= $("i.cm-spinner");
	var $error			= $(".cm-error");
	var $minify			= $("input[name=minify]");
	var $modal			= $("#modal");
	var $download		= (typeof document.createElement('a').download != "undefined");
	var $url			= window.URL || window.webkitURL;
	var $rtl;
	var $style;
	var loaded = false;
	var $out;

	$iframe.css("visibility", "hidden");

	$customizer.customizer($.extend({
		"updating": function(e, style) {
			$iframe.css("visibility", "hidden");
			$spinner.show();
		},
		"updated": function(e, style) {

			var url;

			style.fonts = "";

			$("option[data-url]:selected", $customizer).each(function() {
				if ((url = $(this).data("url")) && style.fonts.indexOf("'" + url + "'") == -1) {
					style.fonts += "@import '" + url + "';\n";
				}
			});

			renderPreview($style = style);
		}
	}, customizer || {}));

	$iframe.on("load", function() {
		$customizer.trigger("update", [false, $iframe[0].contentWindow["CustomizerForceUpdate"]]);
	});

	$error.on({
		"show": function(e, error) {
			$error.html($.mustache("<h1 class=\"uk-h3\">LESS {{type}} Error</h1><p>{{message}}</p>", error)).show();
			$iframe.css("visibility", "hidden");
		},
		"hide": function() {
			$error.hide();
			$iframe.css("visibility", "visible");
		}
	});

	$("input[name=rtl]").on("change", function(e) {
		$rtl = $(this).prop("checked");
		renderPreview($style);
	});

	$("#parse-btn").on("click", function(e) {
		e.preventDefault();
		downloadCSS($(this), $style);
	});

	function renderPreview(style) {

		$.less.getCSS(style.less, {
			id: style.name,
			variables: style.variables,
			compress: true
		}).done(function(css) {

			if (style.fonts) {
				css = style.fonts + "\n" + css;
			}

			$iframe[0].contentWindow.jQuery.UIkit.langdirection = $rtl ? "right" : "left";
			$iframe.contents().find("html").attr("dir", $rtl ? "rtl" : "ltr");
			$iframe.contents().find("[data-compiled-css]").replaceWith('<style data-compiled-css>' + ($rtl ? $.rtl.convert2RTL(css) : css) + '</style>');
			$spinner.hide();
			$error.trigger("hide");

		}).fail(function(e) {
			$error.trigger("show", e);
		});
	}

	function downloadCSS(a, style) {

		var options = $minify.prop("checked") ? {
			compress: true
		} : {};

		$.less.getCSS(style.less, $.extend(options, {
			id: style.name,
			variables: style.variables
		})).done(function(css) {

			if (style.fonts) {
				css = style.fonts + "\n" + css;
			}

			if ($rtl) {
				css = $.rtl.convert2RTL(css);
			}

			css = css.replace(/http(.+?)\/fonts\/?/g, function() {
				return "../fonts/";
			});

			$out = css;
			//console.log('Success | Build CSS complete');

		});
	}

	require([
		"esri/arcgis/Portal", 
		"esri/arcgis/OAuthInfo", 
		"esri/IdentityManager",
		"dojo/dom-style", 
		"dojo/dom-attr", 
		"dojo/dom", 
		"dojo/on", 
		"dojo/_base/array",
		"esri/request",
		"dojo/domReady!"	
	], function(arcgisPortal, OAuthInfo, esriId, domStyle, domAttr, dom, on, arrayUtils, esriRequest) {

		esriConfig.defaults.io.proxyUrl			= "ENTER THE LOCATION OF YOUR PROXY HERE";
		//esriConfig.defaults.io.proxyUrl			= "/proxyphp/proxy.php";
		esriConfig.defaults.io.alwaysUseProxy	= false;
		var info = new OAuthInfo({
			appId: "INSERT YOUR APP ID HERE",
			popup: false
		});
		esriId.registerOAuthInfos([info]);
		//Login on app load
		esriId.getCredential(info.portalUrl + "/sharing");

		esriId.checkSignInStatus(info.portalUrl + "/sharing&response_type=token").then(
			function(data) {				
				displayItems(data);
			}
		).otherwise(
			//unsuccessful login/no admin rights
			function() {
				$('#anonymousPanel').show();
				$('#personalizedPanel').hide();
				$('#uploadPanel').hide();
			}
		);

		on(dom.byId("sign-in"), "click", function() {
			//console.log("click", arguments);
			esriId.getCredential(info.portalUrl + "/sharing");
		});

		on(dom.byId("sign-out"), "click", function() {
			esriId.destroyCredentials();
			window.location.reload();
		});

		function displayItems(Portaldata) {
			new arcgisPortal.Portal(info.portalUrl).signIn().then(

				function(portalUser) {
					
					console.log(portalUser);
					//is the user allowed to update org settings? 
					if(portalUser.role != "org_admin"){
						console.log("Sorry, only admins can use Customiser");
						//Show the rejection page here
						esriId.destroyCredentials();
						window.location.href = 'reject.html';

					}

					$('#userId').html('<i class="uk-icon uk-icon-user"></i> ' + portalUser.firstName);
					$('#anonymousPanel').hide();
					$('#personalizedPanel').show();

					createUploadBtn(portalUser, Portaldata);
				}
			).otherwise(
				function(error) {
					console.log("Error occurred while signing in: ", error);
				}
			);
		}

		function createUploadBtn(portalUser, Portaldata) {

			var htmlFragment = "<span id='upload' class='uk-button uk-button-primary uk-button-expand'>Upload to Portal</span>";

			$("#uploadPanel").html(htmlFragment).show().on( "click", function(e) {

				var r = confirm("Are you sure you want to upload this style to " + portalUser.portal.urlKey + ".maps.arcgis.com");
				
				if (r == true) {

					$('#upload').html('Please wait').addClass('disabled');

					var newContent	= downloadCSS($(this), $style);
					var newStyle	= $out;
					
					var postUrl		= '//' + portalUser.portal.urlKey + '.maps.arcgis.com/sharing/rest/portals/self/update';

					var content = { 
						id: portalUser.orgId,
						name: portalUser.portal.name,
						description: portalUser.portal.description,
						access: portalUser.portal.access,
						allSSL: portalUser.portal.allSSL,
						culture: portalUser.portal.culture,
						cultureFormat: 'us',
						region: portalUser.portal.region,
						featuredItemsGroupQuery: portalUser.portal.featuredItemsGroupQuery,
						canSharePublic: portalUser.portal.canSharePublic,
						canSearchPublic: portalUser.portal.canSearchPublic,
						thumbnail: 'thumbnail.png',
						basemapGalleryGroupQuery: null,
						defaultBasemap: null,
						defaultExtent: JSON.stringify(portalUser.portal.defaultExtent),
						featuredGroups: JSON.stringify(portalUser.portal.featuredGroups),
						homePageFeaturedContent: portalUser.portal.homePageFeaturedContent,
						homePageFeaturedContentCount: portalUser.portal.homePageFeaturedContentCount,
						rotatorPanels:JSON.stringify(
							[{
								id: "banner-html",
								innerHTML: "<style>" + newStyle + "</style>"
							}]
						),
						showHomePageDescription: portalUser.portal.showHomePageDescription,
						templatesGroupQuery: null,
						analysisLayersGroupQuery: null,
						galleryTemplatesGroupQuery: portalUser.portal.galleryTemplatesGroupQuery,
						stylesGroupQuery: null,
						urlKey: portalUser.portal.urlKey,
						commentsEnabled: portalUser.portal.commentsEnabled,
						geocodeService: JSON.stringify(portalUser.portal.helperServices.geocode),
						printServiceTask: '',
						geometryService: '',
						routeServiceLayer: JSON.stringify(portalUser.portal.helperServices.route),
						bingKey: portalUser.portal.bingKey,
						canShareBingPublic: portalUser.portal.canShareBingPublic,
						backgroundImage: portalUser.portal.backgroundImage,
						canSignInIDP: portalUser.portal.canSignInIDP,
						canSignInArcGIS: portalUser.portal.canSignInArcGIS,
						useStandardizedQuery: portalUser.portal.useStandardizedQuery,
						portalProperties: JSON.stringify(portalUser.portal.portalProperties),
						units: portalUser.portal.units,
						mfaEnabled: portalUser.portal.mfaEnabled,
						mfaAdmins: JSON.stringify(portalUser.portal.mfaAdmins),
						metadataEditable: portalUser.portal.metadataEditable,
						metadataFormats: portalUser.portal.metadataFormats[0],
						authorizedCrossOriginDomains: portalUser.portal.authorizedCrossOriginDomains,
						allowedOrigins: null,
						allowedRedirectUris: portalUser.portal.allowedRedirectUris,
						updateUserProfileDisabled: portalUser.portal.updateUserProfileDisabled,
						useVectorBasemaps: true,
						eueiEnabled: false,
						clearEmptyFields: true,
						asyncRouteService: JSON.stringify(portalUser.portal.helperServices.asyncRoute),
						closestFacilityService: JSON.stringify(portalUser.portal.helperServices.closestFacility),
						asyncClosestFacilityService: JSON.stringify(portalUser.portal.helperServices.asyncClosestFacility),
						serviceAreaService: JSON.stringify(portalUser.portal.helperServices.serviceArea),
						asyncServiceAreaService: JSON.stringify(portalUser.portal.helperServices.asyncServiceArea),
						syncVRPService: JSON.stringify(portalUser.portal.helperServices.syncVRP),
						asyncVRPService: JSON.stringify(portalUser.portal.helperServices.asyncVRP),
						asyncLocationAllocationService: JSON.stringify(portalUser.portal.helperServices.asyncLocationAllocation),
						routingUtilitiesService: JSON.stringify(portalUser.portal.helperServices.routingUtilities),
						trafficService: JSON.stringify(portalUser.portal.helperServices.traffic),
						asyncODCostMatrixService: JSON.stringify(portalUser.portal.helperServices.asyncODCostMatrix),
						contacts: JSON.stringify(portalUser.portal.contacts),
						f: "json",
						token: Portaldata.token
					}

					console.log("You pressed OK!");
					console.log(content);
					console.log(portalUser);

					var postRequest = esriRequest({
						url: postUrl,
						content: content,
						handleAs: "json",
						callbackParamName: "callback"
					},{
						usePost: true
					});
					postRequest.then(
						function(response) {
							console.log("Success: ", response);
							$('#upload').removeClass('disabled').html('Upload');
						}, function(error) {
							console.log("Error: ", error);
						}
					);

				} else {
					console.log("Operation cancelled!");
				}

			});

		}

	});

});