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

// ========================================
// MAPEO DIRECTO - SIN TRANSFORMACIONES
// ========================================
function mapPropertyData(record) {
    const fields = record.fields;
    
    // Construir objeto con los mismos nombres que Tenant Turner
    return {
        // Campos obligatorios
        address: fields.Address || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.ZipCode ? String(fields.ZipCode).padStart(5, '0') : '00000',
        propertyType: fields.PropertyType || 'Apartment Unit',
        description: fields.Description || '',
        
        // Fotos - Obligatorio
        photos: fields['Upload photos'] ? fields['Upload photos'].map(img => ({
            url: img.url,
            isPrimary: false
        })) : [{ url: 'https://via.placeholder.com/800x600?text=No+Image', isPrimary: true }],
        
        // Características - Obligatorio
        propertyFeatures: {
            parking: fields.ParkingType || 'None',
            parkingSpots: parseInt(fields.ParkingSpots) || 0,
            cooling: fields.CoolingSystem || 'None',
            heating: fields.HeatingSystem || 'None',
            laundry: fields.Laundry || 'None'
        },
        
        // Amenidades - Obligatorio (array de strings)
        propertyAmenities: fields.Amenities || [],
        
        // Owners - Obligatorio
        owners: [
            {
                name: fields.OwnerName || 'Propietario Principal',
                email: fields.OwnerEmail || 'owner@example.com',
                phone: fields.OwnerPhone ? `1${fields.OwnerPhone.replace(/\D/g, '')}` : '13055551234'
            }
        ],
        
        // Occupants - Obligatorio
        occupants: [
            {
                name: 'Sin ocupantes',
                email: 'none@example.com',
                phone: '13055550000'
            }
        ],
        
        // Campos opcionales
        address2: fields.Address2 || '',
        descriptionTitle: fields.DescriptionTitle || '',
        bedrooms: parseInt(fields.Bedrooms) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        squareFeet: parseInt(fields.SquareFeet) || 850,
        rentAmount: parseFloat(fields.RentAmount) || 0,
        depositAmount: parseFloat(fields.DepositAmount) || 0,
        availableDate: fields.AvailableDate || '',
        minimumLeaseTerm: fields.LeaseTerm || 'One Year',
        virtualTour: fields.VirtualTour || '',
        utilities: fields.UtilitiesIncluded || []
    };
}

// ========================================
// FUNCIONES PRINCIPALES
// ========================================

async function getPropertiesFromAirtable() {
    const records = [];
    
    await base('Automatic apartments')
        .select({
            filterByFormula: `{Published} = FALSE()`,
            maxRecords: 10
        })
        .eachPage((pageRecords, fetchNextPage) => {
            records.push(...pageRecords);
            fetchNextPage();
        });
    
    console.log(`📊 Encontradas ${records.length} propiedades para publicar`);
    return records;
}

async function createPropertyInTenantTurner(propertyData) {
    const encodedApiKey = Buffer.from(TENANT_TURNER_API_KEY).toString('base64');
    
    console.log(`🔑 Longitud de la API Key: ${TENANT_TURNER_API_KEY?.length || 0}`);
    console.log(`🔑 Primeros 5 caracteres: ${TENANT_TURNER_API_KEY?.substring(0, 5) || 'VACÍA'}`);
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    
    // Log del payload para depuración
    console.log('📋 Payload:', JSON.stringify({
        address: propertyData.address,
        propertyType: propertyData.propertyType,
        leaseTerm: propertyData.minimumLeaseTerm,
        amenities: propertyData.propertyAmenities,
        utilities: propertyData.utilities
    }, null, 2));
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Basic ${encodedApiKey}`,
                'Content-Type': 'application/json'
            },
            family: 4,
            timeout: 30000
        });
        
        console.log(`✅ Propiedad creada exitosamente: ${propertyData.address}`);
        return response.data;
    } catch (error) {
        if (error.response) {
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
                const propertyData = mapPropertyData(record);
                await createPropertyInTenantTurner(propertyData);
                await markAsPublished(record.id);
            } catch (error) {
                console.error(`❌ Falló la propiedad ${record.id}`);
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

const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

main();
