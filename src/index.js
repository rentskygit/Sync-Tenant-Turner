const Airtable = require('airtable');
const axios = require('axios');

// ========================================
// CONFIGURACIÓN
// ========================================
const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties';

// Mapeo de campos de Airtable a Tenant Turner
function mapPropertyData(record) {
    const fields = record.fields;
    
    // Construir dirección completa
    const fullAddress = [
        fields.Address,
        fields.Unit ? `#${fields.Unit}` : '',
        fields.City,
        fields.State,
        fields.Zip
    ].filter(Boolean).join(', ');

    // Mapear opciones de Tenant Turner (ajusta según la documentación de TT)
    const rentalTypeMap = {
        'Apartamento': 'apartment',
        'Casa': 'house',
        'Condo': 'condo',
        'Estudio': 'studio',
        'Duplex': 'duplex'
    };

    const parkingMap = {
        'Garaje': 'garage',
        'Calle': 'street',
        'Cubierto': 'covered',
        'Sin estacionamiento': 'none'
    };

    const leaseTermMap = {
        '6 meses': '6',
        '12 meses': '12',
        '24 meses': '24',
        'Mes a mes': 'monthly'
    };

    return {
        // Campos obligatorios para Tenant Turner
        address: fullAddress,
        unit: fields.Unit || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip ? String(fields.Zip) : '',
        
        // Datos de la propiedad
        rentalType: rentalTypeMap[fields['Rental Type']] || 'apartment',
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        squareFeet: parseInt(fields['Square Fee']) || 0,
        price: parseFloat(fields.Price) || 0,
        deposit: parseFloat(fields.Deposit) || 0,
        
        // Descripción
        title: fields['Description Title'] || '',
        description: fields.Description || '',
        
        // Tour virtual
        virtualTourUrl: fields['Visual Tour'] || '',
        
        // Características
        parking: parkingMap[fields.Parking] || 'none',
        parkingSpots: parseInt(fields.Spot) || 0,
        cooling: fields['Cooling system'] || '',
        heating: fields['Heater system'] || '',
        laundry: fields.Laundry || '',
        
        // Amenidades y servicios
        amenities: fields.Amenities ? fields.Amenities.join(', ') : '',
        utilities: fields.Utilities ? fields.Utilities.join(', ') : '',
        
        // Fechas y términos
        leaseTerm: leaseTermMap[fields['Lease Term']] || '12',
        availableDate: fields['Date Available For Move-In'] || '',
        
        // URLs de imágenes (importante: deben ser URLs públicas)
        images: fields['Upload photos'] ? fields['Upload photos'].map(img => img.url) : []
    };
}

// ========================================
// FUNCIONES PRINCIPALES
// ========================================

async function getPropertiesFromAirtable() {
    const records = [];
    
    await base('Automatic apartments')
        .select({
            filterByFormula: `{Published} = FALSE()`, // Solo propiedades no publicadas
            maxRecords: 10 // Límite para evitar sobrecarga
        })
        .eachPage((pageRecords, fetchNextPage) => {
            records.push(...pageRecords);
            fetchNextPage();
        });
    
    console.log(`📊 Encontradas ${records.length} propiedades para publicar`);
    return records;
}

async function createPropertyInTenantTurner(propertyData) {
    ///
    console.log(`🔑 Longitud de la API Key: ${TENANT_TURNER_API_KEY?.length || 0}`);
    console.log(`🔑 Primeros 5 caracteres de la API Key: ${TENANT_TURNER_API_KEY?.substring(0, 5) || 'VACÍA'}`);
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Bearer ${TENANT_TURNER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ Propiedad creada: ${propertyData.address}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            console.error(`📋 Headers enviados: ${JSON.stringify(error.config.headers)}`);
        } else {
            console.error(`❌ Error de red: ${error.message}`);
        }
        throw error;
    }
    ///
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Bearer ${TENANT_TURNER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`✅ Propiedad creada: ${propertyData.address}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            // La API respondió con un error
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`❌ Error de red: ${error.message}`);
        }
        throw error;
    }
}

async function markAsPublished(recordId) {
    await base('Automatic apartments').update(recordId, {
        Published: true,
        'Date Published': new Date().toISOString()
    });
    console.log(`📝 Marcado como publicado el registro ${recordId}`);
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================

async function main() {
    console.log('🚀 Iniciando sincronización con Tenant Turner...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    
    try {
        const properties = await getPropertiesFromAirtable();
        
        if (properties.length === 0) {
            console.log('ℹ️ No hay propiedades pendientes de publicación');
            return;
        }
        
        for (const record of properties) {
            try {
                // 1. Mapear datos
                const propertyData = mapPropertyData(record);
                console.log(`📤 Publicando: ${propertyData.address}`);
                
                // 2. Enviar a Tenant Turner
                await createPropertyInTenantTurner(propertyData);
                
                // 3. Marcar como publicado en Airtable
                await markAsPublished(record.id);
                
            } catch (error) {
                console.error(`❌ Falló la propiedad ${record.id}`);
                // Continuar con la siguiente propiedad
            }
        }
        
        console.log('✅ Sincronización completada');
        
    } catch (error) {
        console.error('❌ Error en el proceso principal:', error.message);
        process.exit(1);
    }
}

// ========================================
// EJECUCIÓN
// ========================================

// Validar variables de entorno
const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

main();
