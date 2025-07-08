
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AddressFormData } from '@/components/forms/AddressForm';
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

const GOOGLE_MAPS_SCRIPT_ID = "wecanfix-google-maps-places-script";
const GOOGLE_MAPS_CALLBACK_NAME = `initwecanfixMapAddressSelectorCallback_${Math.random().toString(36).substring(2, 15)}`;

// Helper to parse different types of address components from Google Maps APIs
const parseAddressComponents = (components: (google.maps.GeocoderAddressComponent | google.maps.places.AddressComponent)[]) => {
  const get = (type: string) => {
    const component = components.find(c => c.types.includes(type));
    if (!component) return "";
    // The new `Place` object uses `longText`, the older `GeocoderResult` uses `long_name`.
    return (component as any).longText || (component as any).long_name || "";
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const sublocalityLevel2 = get("sublocality_level_2");
  const sublocalityLevel1 = get("sublocality_level_1");
  const locality = get("locality");
  const administrativeAreaLevel1 = get("administrative_area_level_1");
  const postalCode = get("postal_code");
  const premise = get("premise");

  let addressLine1 = [premise, streetNumber, route].filter(Boolean).join(" ");
  if (!addressLine1) addressLine1 = sublocalityLevel2 || sublocalityLevel1;
  
  let addressLine2 = sublocalityLevel1 !== addressLine1 ? sublocalityLevel1 : "";
  if(sublocalityLevel2 && sublocalityLevel2 !== addressLine1 && sublocalityLevel2 !== addressLine2) {
    addressLine2 = [addressLine2, sublocalityLevel2].filter(Boolean).join(", ");
  }

  return { addressLine1, addressLine2, city: locality, state: administrativeAreaLevel1, pincode: postalCode };
};

const MapAddressSelector: React.FC<MapAddressSelectorProps> = ({ apiKey, onAddressSelect, onClose, initialCenter }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  
  const placeChangeListenerRef = useRef<any | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const markerDragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const loadGoogleMapsScript = useCallback(() => {
    if (window.google && window.google.maps && window.google.maps.places && window.google.maps.Geocoder) {
      setIsScriptLoaded(true); setIsLoading(false); return;
    }
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      if (!(window as any)[GOOGLE_MAPS_CALLBACK_NAME]) { (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => { setIsScriptLoaded(true); setIsLoading(false); }; }
      if (window.google?.maps?.places) { setIsScriptLoaded(true); setIsLoading(false); }
      return;
    }
    
    setIsLoading(true);
    (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => { setIsScriptLoaded(true); setIsLoading(false); };
    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geocoding&callback=${GOOGLE_MAPS_CALLBACK_NAME}`;
    script.async = true; script.defer = true;
    script.onerror = () => { console.error("MapAddressSelector: Google Maps script failed to load."); setIsLoading(false); };
    document.head.appendChild(script);
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) loadGoogleMapsScript();
    else { console.warn("MapAddressSelector: Google Maps API Key is missing."); setIsLoading(false); }
    return () => { // Cleanup listeners on unmount
      if (placeChangeListenerRef.current) placeChangeListenerRef.current.remove();
      if (mapClickListenerRef.current) window.google?.maps?.event?.removeListener(mapClickListenerRef.current);
      if (markerDragEndListenerRef.current) window.google?.maps?.event?.removeListener(markerDragEndListenerRef.current);
    };
  }, [apiKey, loadGoogleMapsScript]);

  const processGeocoderResult = useCallback((result: google.maps.GeocoderResult, latLng: google.maps.LatLng) => {
    if (!result.address_components) return;
    const parsedAddress = parseAddressComponents(result.address_components);
    onAddressSelect({
      ...parsedAddress,
      latitude: latLng.lat() || null,
      longitude: latLng.lng() || null,
    });
  }, [onAddressSelect]);

  const geocodePosition = useCallback((position: google.maps.LatLng) => {
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results && results[0]) processGeocoderResult(results[0], position);
        else console.warn('MapAddressSelector: Geocode was not successful: ' + status);
      });
    }
  }, [processGeocoderResult]);

  const updateMarker = useCallback((position: google.maps.LatLngLiteral) => {
    if (!mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;
    if (markerRef.current) markerRef.current.setPosition(position);
    else {
      markerRef.current = new window.google.maps.Marker({ position, map, draggable: true });
      if (markerDragEndListenerRef.current) window.google.maps.event.removeListener(markerDragEndListenerRef.current);
      markerDragEndListenerRef.current = markerRef.current.addListener('dragend', () => {
        const newPosition = markerRef.current?.getPosition();
        if (newPosition) geocodePosition(newPosition);
      });
    }
  }, [geocodePosition]);

  const handleLocateMe = useCallback(() => {
    if (navigator.geolocation && mapInstanceRef.current) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          mapInstanceRef.current?.setCenter(pos);
          mapInstanceRef.current?.setZoom(DETAILED_ZOOM);
          updateMarker(pos);
          geocodePosition(new window.google.maps.LatLng(pos));
        },
        () => alert('Your location is not enabled. Please enable location permissions.'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else alert("Geolocation is not supported or the map is not ready.");
  }, [updateMarker, geocodePosition]);

  const initMap = useCallback(() => {
    if (!isScriptLoaded || !mapRef.current || mapInstanceRef.current) return;
    const centerPosition = initialCenter || DEFAULT_CENTER;
    const map = new window.google.maps.Map(mapRef.current, {
      center: centerPosition, zoom: initialCenter ? DETAILED_ZOOM : DEFAULT_ZOOM,
      mapTypeControl: false, streetViewControl: false,
      fullscreenControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
      zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new window.google.maps.Geocoder();
    updateMarker(centerPosition);

    if (window.google.maps.places) {
        const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement();
        placeAutocomplete.id = 'place-autocomplete-input-map';
        const pacContainer = document.createElement('div');
        pacContainer.style.padding = '10px';
        pacContainer.style.width = 'calc(100% - 80px)';
        pacContainer.style.maxWidth = '500px';
        pacContainer.appendChild(placeAutocomplete);
        map.controls[window.google.maps.ControlPosition.TOP_CENTER].push(pacContainer);
        
        placeChangeListenerRef.current = placeAutocomplete.addEventListener('gmp-placechange', () => {
            const place = placeAutocomplete.place;
            if (place?.location && mapInstanceRef.current) {
                const location = place.location;
                mapInstanceRef.current.setCenter(location);
                mapInstanceRef.current.setZoom(DETAILED_ZOOM);
                updateMarker(location);
                if (place.addressComponents) onAddressSelect({ ...parseAddressComponents(place.addressComponents), latitude: location.lat, longitude: location.lng });
            }
        });
    }

    const locateMeButtonContainer = document.createElement('div');
    locateMeButtonContainer.style.margin = '10px';
    const locateMeButton = document.createElement('button');
    locateMeButton.type = 'button';
    locateMeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
    Object.assign(locateMeButton.style, { backgroundColor: 'white', border: `1px solid rgba(0,0,0,0.1)`, borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,.3)', cursor: 'pointer', padding: '8px', height: '38px', width: '38px' });
    locateMeButton.onclick = handleLocateMe;
    locateMeButtonContainer.appendChild(locateMeButton);
    map.controls[window.google.maps.ControlPosition.RIGHT_BOTTOM].push(locateMeButtonContainer);

    mapClickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) { updateMarker(e.latLng.toJSON()); geocodePosition(e.latLng); }
    });
  }, [isScriptLoaded, initialCenter, handleLocateMe, updateMarker, onAddressSelect, geocodePosition]);
  
  useEffect(() => { initMap(); }, [initMap]);

  return (
    <div className="w-full h-full flex flex-col relative">
      {(isLoading || !isScriptLoaded) && <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}
      {!apiKey && !isLoading && <div className="flex items-center justify-center h-full"><p className="text-muted-foreground p-4 text-center">Google Maps API key not configured.</p></div>}
      <div ref={mapRef} className="w-full flex-grow" style={{ minHeight: '300px' }}></div>
      <div className="p-4 border-t bg-background mt-auto"><Button onClick={onClose} variant="outline" className="w-full">Use This Location</Button></div>
    </div>
  );
};

export default MapAddressSelector;
