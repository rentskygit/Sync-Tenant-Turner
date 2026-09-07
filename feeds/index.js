const Airtable = require('airtable');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { XMLBuilder } = require('fast-xml-parser'); 

const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties';


const ZILLOW_ENABLED = process.env.ENABLE_ZILLOW_FEED === 'true' || false;
const ZILLOW_FEED_URL = process.env.ZILLOW_FEED_URL || '';


function mapPropertyData(record) {
    const fields = record.fields;
    
    let squareFootage = parseInt(fields['Square Fee']);
    if (squareFootage < 100) squareFootage = 100;
    if (squareFootage > 20000) squareFootage = 20000;
    
    let rentAmount = parseFloat(fields.Price);
    rentAmount = Math.round(rentAmount * 100) / 100;
    if (rentAmount < 100) rentAmount = 100;
    if (rentAmount > 100000) rentAmount = 100000;
    
    let depositAmount = parseFloat(fields.Deposit) || 0;
    depositAmount = Math.round(depositAmount * 100) / 100;
    
    let parkingCount = parseInt(fields.Spot) || 0;
    
    const utilities = fields.Utilities || [];
    const rentIncludes = {
        rentIncludesTrash: utilities.includes('trash'),
        rentIncludesWater: utilities.includes('water'),
        rentIncludesElectricity: utilities.includes('electricity'),
        rentIncludesGas: utilities.includes('gas'),
        rentIncludesCable: utilities.includes('cable'),
        rentIncludesInternet: utilities.includes('internet')
    };
    
    const amenityMap = {
        'Fenced': 'Fenced Yard',
        'Pool': 'Swimming Pool',
        'Gym': 'Fitness Center',
        'Clubhouse': 'Club House',
        'Playground': 'Playground',
        'Tennis': 'Tennis Court',
        'Basketball': 'Basketball Court',
        'Spa': 'Spa/Hot Tub',
        'Sauna': 'Sauna',
        'Business Center': 'Business Center',
        'Conference Room': 'Conference Room',
        'Elevator': 'Elevator',
        'Handicap Access': 'Handicap Accessible',
        'Pet Park': 'Pet Park',
        'Car Wash': 'Car Wash Area',
        'Bike Racks': 'Bike Racks',
        'Storage': 'Storage Units',
        'Security': 'Security System',
        'Gated': 'Gated Community',
        'Lake': 'Lake View',
        'Golf': 'Golf Course',
        'Tennis Court': 'Tennis Court',
        'Basketball Court': 'Basketball Court',
        'Volleyball': 'Volleyball Court',
        'Soccer': 'Soccer Field',
        'Walking Trails': 'Walking Trails'
    };
    
    const propertyAmenities = fields.Amenities 
        ? fields.Amenities.map(a => amenityMap[a] || a).filter(Boolean) 
        : [];
    
    let photos = [];
    if (fields['Upload photos '] && fields['Upload photos '].length > 0) {
        photos = fields['Upload photos '].map((img, index) => ({
            url: img.url,
            order: index
        }));
    } else {
        photos = [{ url: 'https://via.placeholder.com/800x600?text=No+Image', order: 0 }];
    }
    
    const propertyData = {
        PropertyManager: 'Vivian Serrano',
        address: fields.Address || '',
        address2: fields.Unit || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip_Code ? String(fields.Zip_Code).padStart(5, '0') : '00000',
        propertyType: fields['Rental Type'] || 'Apartment Unit',
        description: fields.Description || '',
        descriptiveTitle: fields['Description Title'] || '',
        photos: photos,
        owners: [
            {
                email: fields['Owner Email'] || 'owner@example.com'
            }
        ],
        occupants: [
            {
                phone: fields['Phone'] || '13055550000',
                email: fields['Email'] || 'none@example.com'
            }
        ],
        assignedUserEmail: 'Cmelo@jcmrealtygroup.com',
        propertyFeatures: {
            laundry: fields.Laundry || 'None',
            parkingType: fields.Parking || 'None',
            parkingCount: parkingCount,
            coolingSystem: fields['Cooling system'] || 'None',
            heatingSystem: fields['Heater system'] || 'None',
            ...rentIncludes
        },
        propertyAmenities: propertyAmenities,
        squareFootage: squareFootage,
        rentAmount: rentAmount,
        depositAmount: depositAmount,
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        dateAvailable: fields['Date Available For Move-In'] || '',
        minimumLeaseTerm: fields['Lease Term'] || 'One Year',
        virtualTour: fields['Visual tour link'] || '',
        syndication: {
            selectAll: true,
            EnableZillowInstantTouring: fields['EnableZillowInstantTouring'] || false
        },
        restrictions: {
            RequireMoveInDateWithinMaximum: fields['RestrictionMoveInDays'] || false,
            ConsiderPets: fields['AllowPets'] || false,
            MaximumNumberOfPets: parseInt(fields['MaxPets']) || 0,
            AllowCats: fields['AllowCats'] || false,
            AllowSmallDogs: fields['AllowSmallDogs'] || false,
            AllowLargeDogs: fields['AllowLargeDogs'] || false,
            requireIncomeRatio: fields['RequireIncomeRatio'] || false
        }
    };
    
    return propertyData;
}

async function getPropertiesFromAirtable() {
    const records = [];
    
    try {
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
    } catch (error) {
        console.error('❌ Error al obtener propiedades de Airtable:', error.message);
        throw error;
    }
}

async function createPropertyInTenantTurner(propertyData) {
    const encodedApiKey = Buffer.from(TENANT_TURNER_API_KEY).toString('base64');
    
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Basic ${encodedApiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        console.log(`✅ Propiedad creada exitosamente: ${propertyData.address}`);
        console.log(`📋 ID en Tenant Turner: ${response.data?.id || 'N/A'}`);
        
        if (response.data) {
            console.log(`📋 URL: ${response.data?.url || 'N/A'}`);
        }
        
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`);
            console.error('📋 Payload que causó el error:', JSON.stringify(propertyData, null, 2));
        } else if (error.request) {
            console.error(`❌ No se recibió respuesta del servidor: ${error.message}`);
        } else {
            console.error(`❌ Error al configurar la petición: ${error.message}`);
        }
        throw error;
    }
}

async function markAsPublished(recordId) {
    try {
        await base('Automatic apartments').update(recordId, {
            'Published': true
        });
        console.log(`📝 Marcado como publicado el registro ${recordId}`);
    } catch (error) {
        console.error(`❌ Error al marcar como publicado: ${error.message}`);
    }
}

function mapToZillowFormat(record) {
    const fields = record.fields;
    
    const propertyTypeMap = {
        'Apartment Unit': 'apartment',
        'Condominium': 'condo',
        'Townhouse': 'townhouse',
        'Single Family': 'single_family',
        'Duplex': 'duplex',
        'Studio': 'studio'
    };

    const utilities = fields.Utilities || [];
    const includedUtilities = [];
    if (utilities.includes('trash')) includedUtilities.push('trash');
    if (utilities.includes('water')) includedUtilities.push('water');
    if (utilities.includes('electricity')) includedUtilities.push('electricity');
    if (utilities.includes('gas')) includedUtilities.push('gas');
    if (utilities.includes('cable')) includedUtilities.push('cable');
    if (utilities.includes('internet')) includedUtilities.push('internet');

    const amenityMap = {
        'Fenced': 'fenced_yard',
        'Pool': 'swimming_pool',
        'Gym': 'fitness_center',
        'Clubhouse': 'clubhouse',
        'Playground': 'playground',
        'Tennis': 'tennis_court',
        'Basketball': 'basketball_court',
        'Spa': 'spa',
        'Sauna': 'sauna',
        'Business Center': 'business_center',
        'Conference Room': 'conference_room',
        'Elevator': 'elevator',
        'Handicap Access': 'handicap_accessible',
        'Pet Park': 'pet_park',
        'Car Wash': 'car_wash',
        'Bike Racks': 'bike_racks',
        'Storage': 'storage_units',
        'Security': 'security_system',
        'Gated': 'gated_community',
        'Lake': 'lake_view',
        'Golf': 'golf_course',
        'Walking Trails': 'walking_trails'
    };

    const amenities = fields.Amenities 
        ? fields.Amenities.map(a => amenityMap[a] || a).filter(Boolean)
        : [];

    const photos = (fields['Upload photos '] || []).map(img => ({
        photo: img.url
    }));

    if (photos.length === 0) {
        photos.push({ photo: 'https://via.placeholder.com/800x600?text=No+Image' });
    }

    const laundryMap = {
        'In Unit': 'in_unit',
        'On Site': 'on_site',
        'None': 'none'
    };

    const parkingMap = {
        'Garage': 'garage',
        'Carport': 'carport',
        'Off Street': 'off_street',
        'On Street': 'on_street',
        'None': 'none'
    };

    const leaseTermMap = {
        'One Year': '12',
        'Six Months': '6',
        'Month to Month': 'month_to_month'
    };

    return {
        listing: {
            '@_id': record.id,
            '@_status': 'active',
            address: {
                street: fields.Address || '',
                unit: fields.Unit || '',
                city: fields.City || '',
                state: fields.State || '',
                zipcode: fields.Zip_Code ? String(fields.Zip_Code).padStart(5, '0') : '00000'
            },
            property: {
                type: propertyTypeMap[fields['Rental Type']] || 'apartment',
                bedrooms: parseInt(fields.Beds) || 0,
                bathrooms: parseFloat(fields.Bathrooms) || 0,
                square_feet: parseInt(fields['Square Fee']) || 0
            },
            rental: {
                price: Math.round(parseFloat(fields.Price) * 100) / 100 || 0,
                deposit: parseFloat(fields.Deposit) || 0,
                available_date: fields['Date Available For Move-In'] || '',
                lease_term: leaseTermMap[fields['Lease Term']] || fields['Lease Term'] || '12',
                utilities: includedUtilities.length > 0 ? includedUtilities : undefined,
                laundry: laundryMap[fields.Laundry] || 'none',
                parking: {
                    type: parkingMap[fields.Parking] || 'none',
                    spots: parseInt(fields.Spot) || 0
                }
            },
            description: {
                title: fields['Description Title'] || '',
                body: fields.Description || ''
            },
            amenities: amenities.length > 0 ? amenities : undefined,
            photos: photos,
            contact: {
                name: 'JCM Realty Group',
                phone: fields.Phone || '13055550000',
                email: fields.Email || 'info@jcmrealtygroup.com'
            },
            agent: {
                name: 'Vivian Serrano',
                email: 'Cmelo@jcmrealtygroup.com',
                phone: fields.Phone || '13055550000'
            },
            features: {
                pets_allowed: fields.AllowPets || false,
                cats_allowed: fields.AllowCats || false,
                small_dogs_allowed: fields.AllowSmallDogs || false,
                large_dogs_allowed: fields.AllowLargeDogs || false
            },
            url: fields['Visual tour link'] || '',
            virtual_tour: fields['Visual tour link'] || ''
        }
    };
}

function generateZillowFeedXML(records) {
    try {
        const listings = records.map(record => mapToZillowFormat(record));
        
        const feed = {
            '?xml': null,
            listings: {
                '@_version': '1.0',
                '@_xmlns': 'http://www.zillow.com/instant/feed/1.0',
                listing: listings.map(l => l.listing)
            }
        };

        const builder = new XMLBuilder({
            ignoreAttributes: false,
            format: true,
            attributeNamePrefix: '@_',
            suppressEmptyNode: true,
            suppressBooleanAttributes: false
        });

        return builder.build(feed);
    } catch (error) {
        console.error('❌ Error generando XML de Zillow:', error.message);
        throw error;
    }
}

function saveZillowFeedXML(xml, filename = 'zillow_feed.xml') {
    try {
        const outputPath = path.join(__dirname, filename);
        fs.writeFileSync(outputPath, xml);
        console.log(`✅ Feed Zillow guardado en: ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('❌ Error guardando feed Zillow:', error.message);
        throw error;
    }
}
async function uploadZillowFeed(xml) {
    if (process.env.AWS_ACCESS_KEY_ID) {
        try {
            const AWS = require('aws-sdk');
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || 'us-east-1'
            });

            const params = {
                Bucket: process.env.AWS_S3_BUCKET,
                Key: 'feeds/zillow_feed.xml',
                Body: xml,
                ContentType: 'application/xml',
                CacheControl: 'no-cache'
            };

            await s3.upload(params).promise();
            console.log(`✅ Feed subido a S3: https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/feeds/zillow_feed.xml`);
            return true;
        } catch (error) {
            console.error('❌ Error subiendo a S3:', error.message);
            return false;
        }
    }
    return false;
}

async function processZillowFeed(records) {
    if (!ZILLOW_ENABLED) {
        console.log('ℹ️ Zillow Feed deshabilitado (ENABLE_ZILLOW_FEED no es true)');
        return;
    }

    console.log('📤 Generando feed para Zillow...');
    
    try {
        // Generar XML
        const xml = generateZillowFeedXML(records);
        
        // Guardar archivo
        const filePath = saveZillowFeedXML(xml);
        
        // Intentar subir a S3 si está configurado
        await uploadZillowFeed(xml);
        
        console.log(`✅ Feed Zillow generado exitosamente con ${records.length} propiedades`);
        console.log(`📋 URL sugerida para Zillow: ${ZILLOW_FEED_URL || 'https://tu-dominio.github.io/feeds/zillow_feed.xml'}`);
        
        return {
            success: records.length,
            filePath: filePath,
            feedUrl: ZILLOW_FEED_URL || filePath
        };
    } catch (error) {
        console.error('❌ Error procesando feed de Zillow:', error.message);
        return { success: 0, failed: records.length, error: error.message };
    }
}


async function main() {
    console.log('🚀 Iniciando sincronización con Tenant Turner...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    console.log(`📌 API URL: ${TENANT_TURNER_API_URL}`);
    
    try {
        const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
        const missing = requiredEnv.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
            process.exit(1);
        }
        const properties = await getPropertiesFromAirtable();
        
        if (properties.length === 0) {
            console.log('ℹ️ No hay propiedades pendientes de publicación');
            
            if (ZILLOW_ENABLED) {
                console.log('📤 Generando feed vacío para Zillow (sin propiedades)');
                await processZillowFeed([]);
            }
            return;
        }
        console.log('\n🔄 --- PROCESANDO TENANT TURNER ---');
        let successCount = 0;
        let failCount = 0;
        const processedIds = [];
        
        for (const record of properties) {
            try {
                console.log(`\n🔄 Procesando propiedad ${record.id} para Tenant Turner...`);
                const propertyData = mapPropertyData(record);
                await createPropertyInTenantTurner(propertyData);
                await markAsPublished(record.id);
                successCount++;
                processedIds.push(record.id);
                console.log(`✅ Propiedad ${record.id} procesada en Tenant Turner exitosamente`);
            } catch (error) {
                failCount++;
                console.error(`❌ Falló la propiedad ${record.id} en Tenant Turner: ${error.message}`);
            }
        }
        
        console.log('\n📊 RESUMEN TENANT TURNER:');
        console.log(`✅ Exitosas: ${successCount}`);
        console.log(`❌ Fallidas: ${failCount}`);
        console.log(`📊 Total: ${properties.length}`);
        
        if (ZILLOW_ENABLED) {
            console.log('\n🔄 --- PROCESANDO ZILLOW FEED ---');
            
            const zillowResult = await processZillowFeed(properties);
            
            console.log('\n📊 RESUMEN ZILLOW FEED:');
            if (zillowResult && zillowResult.success) {
                console.log(`✅ Propiedades incluidas en feed: ${zillowResult.success}`);
                console.log(`📋 Archivo generado: ${zillowResult.filePath}`);
                if (zillowResult.feedUrl) {
                    console.log(`🔗 URL del feed: ${zillowResult.feedUrl}`);
                }
            } else {
                console.log('❌ Error generando feed Zillow');
            }
        }
        
        console.log('\n✅ Sincronización completada');
        
    } catch (error) {
        console.error('❌ Error en el proceso principal:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    mapPropertyData,
    getPropertiesFromAirtable,
    createPropertyInTenantTurner,
    markAsPublished,
    main,
    
    mapToZillowFormat,
    generateZillowFeedXML,
    saveZillowFeedXML,
    processZillowFeed
};
