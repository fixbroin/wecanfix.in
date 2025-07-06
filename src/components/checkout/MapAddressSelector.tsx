
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AddressFormData } from '@/app/checkout/address/page';
import { Loader2, LocateFixed } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface MapAddressSelectorProps {
  apiKey: string;
  onAddressSelect: (address: Partial<AddressFormData>) => void;
  onClose: () => void;
  initialCenter?: google.maps.LatLngLiteral | null;
}

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore
const DEFAULT_ZOOM = 12;
const DETAILED_ZOOM = 17;

const GOOGLE_MAPS_SCRIPT_ID = "fixbro-google-maps-places-script";
const GOOGLE_MAPS_CALLBACK_NAME = `initFixBroMapAddressSelectorCallback_${Math.random().toString(36).substring(2, 15)}`;


const MapAddressSelector: React.FC<MapAddressSelectorProps> = ({ apiKey, onAddressSelect, onClose, initialCenter }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const autocompleteInstanceRef = useRef<google.maps.places.Autocomplete | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  
  const placeChangedListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const markerDragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const loadGoogleMapsScript = useCallback(() => {
    if (window.google && window.google.maps && window.google.maps.places && window.google.maps.Geocoder) {
      setIsScriptLoaded(true);
      setIsLoading(false);
      return;
    }

    if (document.getElementById(GOOGLE_MAPS_SCRIPT_ID)) {
      if (!(window as any)[GOOGLE_MAPS_CALLBACK_NAME]) {
        (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => {
          setIsScriptLoaded(true);
          setIsLoading(false);
        };
      }
      if (window.google && window.google.maps && window.google.maps.places && window.google.maps.Geocoder) {
         setIsScriptLoaded(true);
         setIsLoading(false);
      }
      return;
    }
    
    setIsLoading(true); 

    (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => {
      setIsScriptLoaded(true);
      setIsLoading(false);
    };

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID; 
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geocoding&callback=${GOOGLE_MAPS_CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.error("MapAddressSelector: Google Maps script could not be loaded.");
      setIsLoading(false); 
      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      if (existingScript) existingScript.remove();
      if ((window as any)[GOOGLE_MAPS_CALLBACK_NAME]) delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
    };

    document.head.appendChild(script);
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) {
      loadGoogleMapsScript();
    } else {
      console.warn("MapAddressSelector: Google Maps API Key is missing.");
      setIsLoading(false);
    }
    
    return () => {
        if (placeChangedListenerRef.current && autocompleteInstanceRef.current) {
            window.google?.maps?.event?.removeListener(placeChangedListenerRef.current);
        }
        if (mapClickListenerRef.current && mapInstanceRef.current) {
            window.google?.maps?.event?.removeListener(mapClickListenerRef.current);
        }
        if (markerDragEndListenerRef.current && markerRef.current) {
            window.google?.maps?.event?.removeListener(markerDragEndListenerRef.current);
        }
    };
  }, [apiKey, loadGoogleMapsScript]);

  const processAddressResult = useCallback((result: google.maps.places.PlaceResult | google.maps.GeocoderResult, latLng?: google.maps.LatLng | null, updateInput = true) => {
    const addressComponents = result.address_components;
    if (!addressComponents) {
      console.warn("MapAddressSelector: No address components found for result.");
      return;
    }

    let streetNumber = "";
    let route = "";
    let sublocalityLevel1 = ""; 
    let sublocalityLevel2 = "";
    let locality = ""; 
    let administrativeAreaLevel1 = ""; 
    let postalCode = "";
    let premise = "";

    for (const component of addressComponents) {
      const types = component.types;
      if (types.includes("premise")) premise = component.long_name;
      if (types.includes("street_number")) streetNumber = component.long_name;
      if (types.includes("route")) route = component.long_name;
      if (types.includes("sublocality_level_2")) sublocalityLevel2 = component.long_name;
      if (types.includes("sublocality_level_1")) sublocalityLevel1 = component.long_name;
      if (types.includes("locality")) locality = component.long_name;
      if (types.includes("administrative_area_level_1")) administrativeAreaLevel1 = component.long_name;
      if (types.includes("postal_code")) postalCode = component.long_name;
    }
    
    let determinedAddressLine1 = "";
    const streetLevelInfo = [streetNumber, route].filter(Boolean).join(" ");
    const placeName = 'name' in result && result.name && result.name !== locality && result.name !== administrativeAreaLevel1 ? result.name : null;

    if (premise) {
      determinedAddressLine1 = [premise, streetLevelInfo].filter(Boolean).join(", ");
    } else if (placeName && streetLevelInfo && placeName !== streetLevelInfo) {
        determinedAddressLine1 = [placeName, streetLevelInfo].filter(Boolean).join(", ");
    } else if (placeName && !streetLevelInfo) {
        determinedAddressLine1 = placeName;
    } else if (streetLevelInfo) {
        determinedAddressLine1 = streetLevelInfo;
    }

    if (!determinedAddressLine1 && sublocalityLevel2) {
      determinedAddressLine1 = sublocalityLevel2;
    } else if (!determinedAddressLine1 && sublocalityLevel1) {
      determinedAddressLine1 = sublocalityLevel1;
    }
    
    let determinedAddressLine2 = "";
    if (sublocalityLevel1 && determinedAddressLine1 && !determinedAddressLine1.includes(sublocalityLevel1)) {
      determinedAddressLine2 = sublocalityLevel1;
    }
    else if (sublocalityLevel2 && determinedAddressLine1 && !determinedAddressLine1.includes(sublocalityLevel2) && sublocalityLevel1 === determinedAddressLine1) {
      determinedAddressLine2 = sublocalityLevel2;
    }
    else if (placeName && determinedAddressLine1 === placeName) {
      if (sublocalityLevel2) determinedAddressLine2 = sublocalityLevel2;
      else if (sublocalityLevel1) determinedAddressLine2 = sublocalityLevel1;
    }

    if (result.formatted_address && !determinedAddressLine1) {
        const parts = result.formatted_address.split(',');
        determinedAddressLine1 = parts[0]?.trim();
        if (parts.length > 1 && !determinedAddressLine2 && parts[1]?.trim() !== locality) {
            determinedAddressLine2 = parts[1]?.trim();
        }
    }

    const currentLatLng = latLng || result.geometry?.location;

    const selectedAddress: Partial<AddressFormData> = {
      addressLine1: determinedAddressLine1 || "",
      addressLine2: determinedAddressLine2 || "",
      city: locality,
      state: administrativeAreaLevel1,
      pincode: postalCode,
      latitude: currentLatLng?.lat() || null,
      longitude: currentLatLng?.lng() || null,
    };

    onAddressSelect(selectedAddress);
    
    if (updateInput && autocompleteInputRef.current && result.formatted_address) {
      autocompleteInputRef.current.value = result.formatted_address;
    }
  }, [onAddressSelect]);

  const geocodePosition = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral, updateInput = true) => {
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          processAddressResult(results[0], position instanceof google.maps.LatLng ? position : new google.maps.LatLng(position), updateInput);
        } else {
          console.warn('MapAddressSelector: Geocode (from click/drag) was not successful: ' + status);
        }
      });
    }
  }, [processAddressResult]);

  const updateMarker = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral, map: google.maps.Map, shouldGeocode = false, updateInput = true) => {
    if (!window.google || !window.google.maps) return;

    if (markerRef.current) {
      markerRef.current.setPosition(position);
    } else {
      markerRef.current = new window.google.maps.Marker({
        position: position,
        map: map,
        draggable: true,
      });

      if (markerDragEndListenerRef.current) {
          window.google.maps.event.removeListener(markerDragEndListenerRef.current);
      }
      markerDragEndListenerRef.current = markerRef.current.addListener('dragend', () => {
        if (markerRef.current) {
          const newPosition = markerRef.current.getPosition();
          if (newPosition) {
            geocodePosition(newPosition, true); 
          }
        }
      });
    }

    if (shouldGeocode) {
      geocodePosition(position, updateInput);
    }
  }, [geocodePosition]);

  const handleLocateMe = useCallback(() => {
    const locateButton = document.getElementById('locate-me-button');
    if (!locateButton) return;

    if (navigator.geolocation && mapInstanceRef.current) {
        locateButton.disabled = true;
        const textColor = getComputedStyle(document.body).color;
        locateButton.innerHTML = `<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

        const currentMap = mapInstanceRef.current;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                currentMap.setCenter(pos);
                currentMap.setZoom(DETAILED_ZOOM);
                updateMarker(pos, currentMap, true, false); 
                
                locateButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
                locateButton.disabled = false;
            },
            () => {
                alert('Your location is not enabled. Please enable GPS/location permissions and try again.');
                locateButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
                locateButton.disabled = false;
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        alert("Error: Your browser doesn't support geolocation or the map is not ready.");
    }
  }, [updateMarker]);

  const initMapAndControls = useCallback(() => {
    if (!isScriptLoaded || !mapRef.current || mapInstanceRef.current) return;
  
    const centerPosition = initialCenter || DEFAULT_CENTER;
    const zoomLevel = initialCenter ? DETAILED_ZOOM : DEFAULT_ZOOM;

    const map = new window.google.maps.Map(mapRef.current, {
      center: centerPosition,
      zoom: zoomLevel,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
      zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new window.google.maps.Geocoder();
  
    mapClickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.domEvent?.target || (e.domEvent.target as HTMLElement).closest('.pac-container')) {
            return; 
        }
        if (e.latLng && mapInstanceRef.current) {
            updateMarker(e.latLng, mapInstanceRef.current, true, true);
        }
    });
  
    if (autocompleteInputRef.current) {
      const inputElement = autocompleteInputRef.current;
      const searchWrapper = inputElement.parentElement;
      if (searchWrapper?.dataset.mapControlPlaceholder === "true") {
        searchWrapper.removeChild(inputElement);
      }
      
      const textColorForIcons = getComputedStyle(document.body).color;
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      const primaryTextColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-foreground').trim();
      const cardBgColor = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
      const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
      
      const searchContainer = document.createElement('div');
      searchContainer.style.display = 'flex';
      searchContainer.style.alignItems = 'center';
      searchContainer.style.paddingTop = '10px';
      searchContainer.style.width = 'auto';
      searchContainer.style.minWidth = '280px';
      searchContainer.style.maxWidth = 'min(calc(100% - 90px), 500px)';
      searchContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
      searchContainer.style.borderRadius = '6px';
  
      inputElement.style.flex = '1';
      inputElement.style.borderTopRightRadius = '0';
      inputElement.style.borderBottomRightRadius = '0';
      inputElement.style.borderRight = 'none';
      inputElement.style.height = '42px';
  
      const searchButton = document.createElement('button');
      searchButton.id = 'manual-search-button';
      const searchIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(${primaryTextColor})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
      searchButton.innerHTML = searchIconSVG;
      searchButton.title = "Search Address";
      searchButton.style.height = '42px';
      searchButton.style.padding = '0 14px';
      searchButton.style.border = `1px solid hsl(${borderColor})`;
      searchButton.style.borderLeft = 'none';
      searchButton.style.borderTopRightRadius = '6px';
      searchButton.style.borderBottomRightRadius = '6px';
      searchButton.style.cursor = 'pointer';
      searchButton.style.backgroundColor = `hsl(${primaryColor})`;

      searchButton.onclick = () => {
        const address = autocompleteInputRef.current?.value;
        if (address && geocoderRef.current && mapInstanceRef.current) {
          geocoderRef.current.geocode({ address }, (results, status) => {
            if (status === 'OK' && results && results[0] && mapInstanceRef.current) {
              const place = results[0];
              if (place.geometry && place.geometry.location) {
                mapInstanceRef.current.setCenter(place.geometry.location);
                mapInstanceRef.current.setZoom(DETAILED_ZOOM);
                updateMarker(place.geometry.location, mapInstanceRef.current);
                processAddressResult(place, place.geometry.location, true);
              }
            } else { alert('Geocode was not successful for the following reason: ' + status); }
          });
        }
      };
      
      searchContainer.appendChild(inputElement);
      searchContainer.appendChild(searchButton);
      map.controls[window.google.maps.ControlPosition.TOP_CENTER].push(searchContainer);
      
      const ac = new window.google.maps.places.Autocomplete(inputElement, { types: ['address'], componentRestrictions: { country: 'in' }, fields: ["address_components", "geometry", "name", "formatted_address"] });
      autocompleteInstanceRef.current = ac;
      
      placeChangedListenerRef.current = ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(place.geometry.location);
          mapInstanceRef.current.setZoom(DETAILED_ZOOM);
          updateMarker(place.geometry.location, mapInstanceRef.current);
          processAddressResult(place, place.geometry.location, true);
        } else { if (autocompleteInputRef.current) autocompleteInputRef.current.value = ""; }
      });
    }

    const locateMeButtonContainer = document.createElement('div');
    locateMeButtonContainer.style.marginRight = '10px';
    locateMeButtonContainer.style.marginBottom = '22px'; 
    
    const locateMeButton = document.createElement('button');
    locateMeButton.id = 'locate-me-button';
    locateMeButton.title = "Locate Me";
    const bodyStyles = getComputedStyle(document.body);
    const textColorForLocate = bodyStyles.color;
    const backgroundColorForLocate = bodyStyles.backgroundColor;
    const borderColorForLocate = bodyStyles.borderColor || 'rgba(0,0,0,0.1)';

    locateMeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColorForLocate}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
    
    Object.assign(locateMeButton.style, { backgroundColor: backgroundColorForLocate, border: `1px solid ${borderColorForLocate}`, borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,.3)', cursor: 'pointer', padding: '8px', textAlign: 'center', height: '38px', width: '38px' });

    locateMeButton.onclick = handleLocateMe;
    locateMeButtonContainer.appendChild(locateMeButton);
    
    map.controls[window.google.maps.ControlPosition.RIGHT_BOTTOM].push(locateMeButtonContainer);
    
    updateMarker(centerPosition, map, true, false);
  }, [isScriptLoaded, initialCenter, handleLocateMe, updateMarker, processAddressResult]);
  
  useEffect(() => {
    initMapAndControls();
  }, [initMapAndControls]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Loading map...</p>
      </div>
    );
  }
  
  if (!isScriptLoaded && !isLoading && apiKey) { 
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive text-center">Could not load Google Maps. Check API key or network. Reload to try again.</p>
      </div>
    );
  }

  if (!apiKey && !isLoading) {
     return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-center">Google Maps API key not configured. Set in admin settings.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative">
      <div style={{ display: 'none' }} data-map-control-placeholder="true">
        <Input
          ref={autocompleteInputRef}
          type="text"
          placeholder="Search for your address..."
          className="shadow-md"
        />
      </div>
      <div ref={mapRef} className="w-full flex-grow" style={{ minHeight: '300px' }}>
      </div>
      <div className="p-4 border-t bg-background mt-auto">
        <Button onClick={onClose} variant="outline" className="w-full">Use Selected Address & Close</Button>
      </div>
    </div>
  );
};

export default MapAddressSelector;
